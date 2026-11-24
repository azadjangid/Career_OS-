import { Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { aiService } from '../../services/ai.service';
import { agentService, getPending, toDisplayMessages, type AgentResult, type Emit } from '../../services/agent.service';
import { AppError } from '../../middleware/errorHandler';
import { quickMatch, resumeText, userSkillSet } from '../../lib/match';
import { topSkills } from '../../lib/atsScore';

const normSkill = (s: string) => s.trim().toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9+#]/g, '');
import { matchJobForUser } from '../../lib/jobMatch';
import { logger } from '../../config/logger';
import { captureError } from '../../lib/sentry';
import { providerHealth, testConnection } from '../../lib/llm';
import { getUserAIPrefs } from '../../lib/aiPrefs';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

async function saveConversation(userId: string, id: string | undefined, firstMessage: string, messages: Anthropic.MessageParam[]) {
  const data = { messages: messages as unknown as Prisma.InputJsonValue };
  if (id) return prisma.aIConversation.update({ where: { id }, data });
  return prisma.aIConversation.create({
    data: { userId, title: firstMessage.slice(0, 80) || 'New chat', model: env.AI_DEFAULT_MODEL, ...data },
  });
}

function agentResponse(conversationId: string, r: AgentResult) {
  return { reply: r.reply, conversationId, pending: r.pending, toolsUsed: r.toolsUsed };
}

/** Resume by id, or the user's default one. */
async function pickResume(userId: string, resumeId?: string) {
  const resume = resumeId
    ? await prisma.resume.findFirst({ where: { id: resumeId, userId } })
    : await prisma.resume.findFirst({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  if (!resume) throw new AppError('Upload a resume first', 404);
  return resume;
}

export const aiController = {
  async chat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { message, conversationId } = req.body as { message: string; conversationId?: string };
      if (!message?.trim()) throw new AppError('Message is required', 400);
      if (message.length > 8000) throw new AppError('Message is too long', 400);

      const conversation = conversationId
        ? await prisma.aIConversation.findFirst({ where: { id: conversationId, userId: uid(req) } })
        : null;
      if (conversationId && !conversation) throw new AppError('Conversation not found', 404);

      const history = (conversation?.messages ?? []) as unknown as Anthropic.MessageParam[];
      const result = await agentService.send(uid(req), history, message.trim());
      const saved = await saveConversation(uid(req), conversation?.id, message, result.messages);
      res.json({ success: true, data: agentResponse(saved.id, result) });
    } catch (e) { next(e); }
  },

  /** Server-sent events version of chat: streams text deltas, tool activity, then a final `done` event. */
  async chatStream(req: AuthRequest, res: Response, next: NextFunction) {
    let started = false;
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const { message, conversationId } = req.body as { message: string; conversationId?: string };
      if (!message?.trim()) throw new AppError('Message is required', 400);
      if (message.length > 8000) throw new AppError('Message is too long', 400);

      const conversation = conversationId
        ? await prisma.aIConversation.findFirst({ where: { id: conversationId, userId: uid(req) } })
        : null;
      if (conversationId && !conversation) throw new AppError('Conversation not found', 404);

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
      started = true;

      const emit: Emit = e => send(e.type, e);
      const history = (conversation?.messages ?? []) as unknown as Anthropic.MessageParam[];
      const result = await agentService.send(uid(req), history, message.trim(), emit);
      const saved = await saveConversation(uid(req), conversation?.id, message, result.messages);
      send('done', agentResponse(saved.id, result));
      res.end();
    } catch (e) {
      if (!started) return next(e);
      // Headers are already sent, so the error handler can't run: log here and tell the client why
      const known = e instanceof AppError;
      const requestId = (req as AuthRequest & { id?: string }).id;
      if (known) logger.warn({ requestId, userId: uid(req), code: e.code, status: e.statusCode }, `AI chat failed: ${e.message}`);
      else { logger.error({ err: e, requestId, userId: uid(req) }, 'AI chat failed with an unexpected error'); captureError(e, { path: 'ai/chat/stream' }); }
      send('error', {
        code: known ? e.code ?? 'ERROR' : 'INTERNAL_ERROR',
        message: known ? e.message : `Something went wrong on the server while generating the response${requestId ? ` (reference ${requestId})` : ''}.`,
      });
      res.end();
    }
  },

  /** Approve or reject the agent's pending actions, then continue the run. */
  async resolveAction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { conversationId, approve } = req.body as { conversationId: string; approve: boolean };
      if (!conversationId || typeof approve !== 'boolean') throw new AppError('conversationId and approve are required', 400);

      const conversation = await prisma.aIConversation.findFirst({ where: { id: conversationId, userId: uid(req) } });
      if (!conversation) throw new AppError('Conversation not found', 404);

      const history = conversation.messages as unknown as Anthropic.MessageParam[];
      const result = await agentService.resolve(uid(req), history, approve);
      await saveConversation(uid(req), conversation.id, '', result.messages);
      res.json({ success: true, data: agentResponse(conversation.id, result) });
    } catch (e) { next(e); }
  },

  async analyzeResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { resumeId, resumeText: raw, jobDescription } = req.body as { resumeId?: string; resumeText?: string; jobDescription?: string };
      let text = raw;
      if (resumeId) text = resumeText(await pickResume(uid(req), resumeId));
      if (!text?.trim()) throw new AppError('Resume text is required. Re-upload a text-based PDF or DOCX.', 400);

      const analysis = await aiService.analyzeResume(text, uid(req), jobDescription?.slice(0, 12_000));

      // Only persist generic (non job-specific) analyses on the resume record
      if (resumeId && !jobDescription) {
        await prisma.resume.update({
          where: { id: resumeId },
          data: {
            atsScore: typeof analysis['atsScore'] === 'number' ? Math.round(analysis['atsScore']) : null,
            keywords: Array.isArray(analysis['keywords']) ? (analysis['keywords'] as string[]) : [],
            extractedSkills: Array.isArray(analysis['skills']) ? (analysis['skills'] as string[]) : [],
            aiAnalysis: asJson(analysis),
          },
        });
      }
      res.json({ success: true, data: analysis });
    } catch (e) { next(e); }
  },

  async tailorResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { resumeId, jobDescription } = req.body as { resumeId: string; jobDescription: string };
      if (!jobDescription?.trim()) throw new AppError('Paste a job description', 400);
      const resume = await pickResume(uid(req), resumeId);
      const text = resumeText(resume);
      if (!text.trim()) throw new AppError('This resume has no readable text', 422);
      const result = await aiService.tailorResume(text, jobDescription.slice(0, 12_000), uid(req));
      res.json({ success: true, data: { ...result, resumeText: text } });
    } catch (e) { next(e); }
  },

  async analyzeJobMatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { jobId, resumeId } = req.body as { jobId: string; resumeId?: string };
      const match = await matchJobForUser(uid(req), jobId, resumeId);
      res.json({ success: true, data: match });
    } catch (e) { next(e); }
  },

  /**
   * Career assistant tasks: jd_analysis, skill_gap, roadmap and application_help. Job-based tasks take
   * a saved jobId or a pasted jobDescription. Results are returned for the user to review; nothing is
   * sent or submitted anywhere. (Professional emails use POST /recruiter-messages/draft.)
   */
  async careerTask(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const task = param(req, 'task');
      const b = (req.body ?? {}) as { jobId?: unknown; jobDescription?: unknown; resumeId?: unknown; target?: unknown; weeks?: unknown };
      const userId = uid(req);
      if (!['jd_analysis', 'skill_gap', 'roadmap', 'application_help'].includes(task)) throw new AppError('Unknown career task', 404);

      if (task === 'roadmap') {
        const target = typeof b.target === 'string' ? b.target.trim() : '';
        if (target.length < 2) throw new AppError('Say what you are aiming for, e.g. "Senior React developer"', 400, 'VALIDATION_ERROR');
        const weeks = Math.min(Math.max(parseInt(String(b.weeks ?? 8)) || 8, 2), 26);
        const [skills, profile, jobs] = await Promise.all([
          userSkillSet(userId),
          prisma.profile.findUnique({ where: { userId }, select: { yearsOfExp: true } }),
          prisma.job.findMany({ where: { userId, isActive: true, duplicateOfId: null }, select: { skills: true }, take: 200, orderBy: { createdAt: 'desc' } }),
        ]);
        const known = [...skills.values()];
        const gaps = topSkills(jobs, 15).map(t => t.skill).filter(s => !skills.has(normSkill(s)));
        const y = profile?.yearsOfExp || 2;
        const level = y < 1.5 ? 'ENTRY' : y < 5 ? 'MID' : y < 9 ? 'SENIOR' : 'LEAD';
        const data = await aiService.careerRoadmap({ target: target.slice(0, 200), weeks, level, knownSkills: known, gaps }, userId);
        res.json({ success: true, data: { ...data, weeks, level, gapsConsidered: gaps } });
        return;
      }

      let jd = typeof b.jobDescription === 'string' ? b.jobDescription.trim() : '';
      let job: { id: string; title: string; companyName: string; skills: string[] } | null = null;
      if (typeof b.jobId === 'string' && b.jobId) {
        const j = await prisma.job.findFirst({ where: { id: b.jobId, userId }, select: { id: true, title: true, companyName: true, skills: true, description: true, requirements: true } });
        if (!j) throw new AppError('Job not found', 404);
        jd = [j.description, j.requirements].filter(Boolean).join('\n\n') || j.skills.join(', ');
        job = j;
      }
      if (jd.length < 40) throw new AppError('Pick a saved job or paste a job description of at least a few lines', 400, 'VALIDATION_ERROR');

      if (task === 'jd_analysis') {
        res.json({ success: true, data: await aiService.analyzeJobDescription(jd, userId) });
        return;
      }
      const resume = await pickResume(userId, typeof b.resumeId === 'string' ? b.resumeId : undefined);
      const text = resumeText(resume);
      if (!text.trim()) throw new AppError('This resume has no readable text. Re-upload a text-based PDF or a DOCX.', 422);
      if (task === 'skill_gap') {
        const ai = await aiService.skillGap(text, jd, userId);
        // The rule-based skills check runs alongside, so the AI's view can be compared with the job's listed skills
        const skillsCheck = job?.skills.length ? quickMatch(job.skills, await userSkillSet(userId)) : null;
        res.json({ success: true, data: { ...ai, skillsCheck } });
        return;
      }
      const help = await aiService.applicationHelp(text, jd, job?.title ?? 'this role', job?.companyName ?? 'the company', userId);
      res.json({ success: true, data: help });
    } catch (e) { next(e); }
  },

  /** Cover letter for a saved job, or ad-hoc from a pasted job description (not tied to a job record). */
  async generateCoverLetter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { jobId, resumeId, tone = 'professional', jobDescription, jobTitle, companyName, save = true } = req.body as {
        jobId?: string; resumeId?: string; tone?: string; jobDescription?: string; jobTitle?: string; companyName?: string; save?: boolean;
      };
      const resume = await pickResume(uid(req), resumeId);

      let title = jobTitle?.trim() || 'the role';
      let company = companyName?.trim() || 'your company';
      let description = jobDescription ?? '';
      if (jobId) {
        const job = await prisma.job.findFirst({ where: { id: jobId, userId: uid(req) } });
        if (!job) throw new AppError('Job not found', 404);
        title = job.title; company = job.companyName; description = job.description ?? description;
      }
      if (!description.trim() && !jobId) throw new AppError('Paste a job description', 400);

      const content = await aiService.generateCoverLetter(title, company, description.slice(0, 12_000), resumeText(resume).slice(0, 20_000), tone, uid(req));
      if (!save) {
        res.json({ success: true, data: { content, title: `Cover Letter - ${title} at ${company}` } });
        return;
      }

      const coverLetter = await prisma.coverLetter.create({
        data: { userId: uid(req), jobId: jobId ?? null, resumeId: resume.id, title: `Cover Letter - ${title} at ${company}`, content, tone, aiGenerated: true },
      });
      res.status(201).json({ success: true, data: coverLetter });
    } catch (e) { next(e); }
  },

  async generateInterviewQuestions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { jobId, category = 'behavioral' } = req.body as { jobId: string; category?: string };
      const job = await prisma.job.findFirst({ where: { id: jobId, userId: uid(req) } });
      if (!job) throw new AppError('Job not found', 404);
      const questions = await aiService.generateInterviewQuestions(job.title, job.description ?? job.skills.join(', '), category, uid(req));
      res.json({ success: true, data: questions });
    } catch (e) { next(e); }
  },

  async listConversations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const conversations = await prisma.aIConversation.findMany({
        where: { userId: uid(req) },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      });
      res.json({ success: true, data: conversations });
    } catch (e) { next(e); }
  },

  async getConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const conv = await prisma.aIConversation.findFirst({ where: { id: param(req, 'id'), userId: uid(req) } });
      if (!conv) throw new AppError('Conversation not found', 404);
      const stored = conv.messages as unknown as Anthropic.MessageParam[];
      res.json({ success: true, data: { ...conv, messages: toDisplayMessages(stored), pending: getPending(stored) } });
    } catch (e) { next(e); }
  },

  async deleteConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.aIConversation.deleteMany({ where: { id: param(req, 'id'), userId: uid(req) } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  /** Provider status without calling it: key present and well-formed, model, fallback, last outcome. */
  async health(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const prefs = await getUserAIPrefs(uid(req));
      res.json({ success: true, data: { ...providerHealth(), userModel: prefs.model } });
    } catch (e) { next(e); }
  },

  /** One tiny real request with the user's chosen model, so Settings can prove the setup works. */
  async testConnection(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const prefs = await getUserAIPrefs(uid(req));
      if (!env.AI_KEY) {
        res.json({ success: true, data: { ok: false, code: 'AI_NOT_CONFIGURED', message: providerHealth().keyProblem } });
        return;
      }
      const result = await testConnection(prefs.model);
      if (!result.ok) logger.warn({ userId: uid(req), code: result.code }, `AI connection test failed: ${result.message}`);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },

  /** Monthly usage vs. budget, used by the sidebar meter and the analytics page. */
  async getUsage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const usage = await prisma.aIUsage.aggregate({
        where: { userId: uid(req), createdAt: { gte: start } },
        _sum: { totalTokens: true, cost: true },
        _count: { id: true },
      });
      const used = usage._sum.totalTokens ?? 0;
      res.json({
        success: true,
        data: {
          totalTokens: used, cost: usage._sum.cost ?? 0, requestCount: usage._count.id,
          budgetTokens: env.AI_MONTHLY_BUDGET_TOKENS,
          remainingTokens: Math.max(0, env.AI_MONTHLY_BUDGET_TOKENS - used),
          configured: Boolean(env.AI_KEY),
          provider: env.AI_PROVIDER,
          keyVar: env.AI_PROVIDER === 'nvidia' ? 'NVIDIA_API_KEY' : 'ANTHROPIC_API_KEY',
          keyProblem: env.AI_KEY ? null : providerHealth().keyProblem,
        },
      });
    } catch (e) { next(e); }
  },
};
