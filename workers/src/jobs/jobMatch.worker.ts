import { Worker, Job } from 'bullmq';
import pino from 'pino';
import OpenAI from 'openai';
import { prisma } from '../prisma';
import { getConnectionOptions } from '../redis';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface JobMatchPayload {
  userId: string;
  jobId?: string; // if null, match all active jobs
}

const openai = new OpenAI({ apiKey: process.env.AI_API_KEY });

export const jobMatchWorker = new Worker<JobMatchPayload>(
  'job-match',
  async (job: Job<JobMatchPayload>) => {
    const { userId, jobId } = job.data;

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: { skills: true },
    });

    if (!profile) {
      logger.warn({ userId }, 'No profile found, skipping job match');
      return;
    }

    const jobs = jobId
      ? await prisma.job.findMany({ where: { id: jobId, isActive: true } })
      : await prisma.job.findMany({ where: { isActive: true }, take: 50 });

    const profileSummary = [
      profile.headline,
      profile.summary,
      `Skills: ${profile.skills.map(s => s.name).join(', ')}`,
      profile.yearsOfExp ? `${profile.yearsOfExp} years experience` : '',
      profile.currentRole || '',
    ].filter(Boolean).join('\n');

    let matched = 0;

    for (const j of jobs) {
      try {
        const prompt = `
You are a career matching AI. Compare this candidate profile with the job listing and return a JSON object.

CANDIDATE:
${profileSummary}

JOB:
Title: ${j.title}
Company: ${j.companyName}
Description: ${j.description || 'N/A'}
Required Skills: ${Array.isArray(j.skills) ? j.skills.join(', ') : 'N/A'}

Return JSON: { "overallScore": 0-100, "skillsScore": 0-100, "experienceScore": 0-100, "matchedSkills": [], "missingSkills": [], "summary": "one sentence" }`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 300,
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');

        await prisma.jobMatch.upsert({
          where: { userId_jobId: { userId, jobId: j.id } },
          update: {
            overallScore: result.overallScore || 0,
            skillsScore: result.skillsScore || 0,
            experienceScore: result.experienceScore || 0,
            matchedSkills: result.matchedSkills || [],
            missingSkills: result.missingSkills || [],
            aiSummary: result.summary || '',
          },
          create: {
            userId,
            jobId: j.id,
            overallScore: result.overallScore || 0,
            skillsScore: result.skillsScore || 0,
            experienceScore: result.experienceScore || 0,
            matchedSkills: result.matchedSkills || [],
            missingSkills: result.missingSkills || [],
            aiSummary: result.summary || '',
          },
        });

        matched++;
      } catch (err) {
        logger.error({ jobId: j.id, userId, err }, 'Failed to match job');
      }
    }

    logger.info({ userId, matched }, 'Job matching complete');
    return { matched };
  },
  {
    ...getConnectionOptions(),
    concurrency: 2,
    limiter: { max: 10, duration: 60000 },
  }
);
