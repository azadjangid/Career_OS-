import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
import { resumeText } from './match';
import { AppError } from '../middleware/errorHandler';

/** Runs an AI match for one job against a resume (default resume if none given) and stores the result. */
export async function matchJobForUser(userId: string, jobId: string, resumeId?: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new AppError('Job not found', 404);
  const resume = resumeId
    ? await prisma.resume.findFirst({ where: { id: resumeId, userId } })
    : await prisma.resume.findFirst({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  if (!resume) throw new AppError('Upload a resume first', 404);

  const analysis = await aiService.analyzeJobMatch(
    [job.description, job.requirements].filter(Boolean).join('\n').slice(0, 12_000) || `${job.title} at ${job.companyName}. Skills: ${job.skills.join(', ')}`,
    resumeText(resume).slice(0, 20_000),
    userId,
  );
  const num = (k: string) => (typeof analysis[k] === 'number' ? (analysis[k] as number) : 0);
  const arr = (k: string) => (Array.isArray(analysis[k]) ? (analysis[k] as string[]) : []);
  const fields = {
    resumeId: resume.id,
    overallScore: num('overallScore'), skillScore: num('skillScore'), experienceScore: num('experienceScore'),
    matchedSkills: arr('matchedSkills'), missingSkills: arr('missingSkills'),
    aiExplanation: analysis as Prisma.InputJsonValue,
  };
  return prisma.jobMatch.upsert({
    where: { jobId_userId: { jobId, userId } },
    create: { jobId, userId, ...fields },
    update: fields,
  });
}
