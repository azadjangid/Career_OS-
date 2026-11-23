import { Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { aiService } from '../../services/ai.service';
import { agentService, getPending, toDisplayMessages, type AgentResult, type Emit } from '../../services/agent.service';
import { AppError } from '../../middleware/errorHandler';
import { resumeText } from '../../lib/match';
import { matchJobForUser } from '../../lib/jobMatch';

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
      const msg = e instanceof AppError ? e.message : 'Something went wrong while generating the response.';
      send('error', { message: msg });
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
        },
      });
    } catch (e) { next(e); }
  },
};
