import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { topSkills } from './atsScore';

/**
 * Skills to check a resume against: one job's skills when jobId is given, otherwise the skills most
 * requested by the user's own saved and tracked jobs (active, non-duplicate). Null when there is nothing to compare.
 */
export async function userTargetSkills(userId: string, jobId?: string): Promise<{ skills: string[]; label: string } | null> {
  if (jobId) {
    const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { title: true, companyName: true, skills: true } });
    if (!job) throw new AppError('Job not found', 404);
    return job.skills.length ? { skills: job.skills, label: `${job.title} at ${job.companyName}` } : null;
  }
  const jobs = await prisma.job.findMany({
    where: { userId, isActive: true, duplicateOfId: null, isDemo: false },
    select: { skills: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const top = topSkills(jobs, 15).filter(s => s.count >= 2 || jobs.length < 5);
  return top.length ? { skills: top.map(s => s.skill), label: `your ${jobs.length} saved jobs` } : null;
}
