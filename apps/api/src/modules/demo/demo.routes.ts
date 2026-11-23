import { Router, Response, NextFunction } from 'express';
import { ApplicationStatus, InterviewType, Prisma, WorkMode } from '@prisma/client';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const DAY = 86_400_000;

const COMPANIES: Array<[string, string]> = [
  ['Razorpay', 'Bengaluru'], ['Zerodha', 'Bengaluru'], ['Swiggy', 'Bengaluru'], ['CRED', 'Bengaluru'], ['Freshworks', 'Chennai'],
  ['Postman', 'Bengaluru'], ['Atlassian', 'Remote'], ['Stripe', 'Remote'], ['Notion', 'Remote'], ['Vercel', 'Remote'],
  ['Zoho', 'Chennai'], ['PhonePe', 'Bengaluru'], ['Groww', 'Bengaluru'], ['Meesho', 'Bengaluru'], ['Flipkart', 'Bengaluru'],
  ['Microsoft', 'Hyderabad'], ['Google', 'Gurugram'], ['Adobe', 'Noida'], ['Unacademy', 'Remote'], ['Dream11', 'Mumbai'],
  ['Cleartax', 'Bengaluru'], ['Paytm', 'Noida'], ['Ola', 'Bengaluru'], ['Browserstack', 'Mumbai'], ['Hasura', 'Remote'],
  ['Supabase', 'Remote'], ['Linear', 'Remote'], ['Figma', 'Remote'], ['Shopify', 'Remote'], ['GitLab', 'Remote'],
  ['Jio', 'Mumbai'], ['Infosys', 'Pune'], ['TCS', 'Pune'], ['Wipro', 'Bengaluru'], ['HCL', 'Noida'],
];
const ROLES: Array<[string, string[]]> = [
  ['Frontend Developer', ['React', 'TypeScript', 'Tailwind CSS', 'JavaScript', 'REST APIs']],
  ['Senior React Developer', ['React', 'TypeScript', 'Redux', 'Testing', 'GraphQL']],
  ['Full Stack Engineer', ['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Docker']],
  ['Software Engineer', ['JavaScript', 'Node.js', 'SQL', 'Git', 'AWS']],
  ['UI Engineer', ['React', 'CSS', 'Figma', 'Accessibility', 'TypeScript']],
  ['Backend Engineer', ['Node.js', 'PostgreSQL', 'Redis', 'Docker', 'REST APIs']],
  ['Next.js Developer', ['Next.js', 'React', 'TypeScript', 'Vercel', 'Tailwind CSS']],
];
// 20 applications: status, days ago applied
const APP_PLAN: Array<[ApplicationStatus, number]> = [
  ['APPLIED', 2], ['APPLIED', 4], ['APPLIED', 5], ['APPLIED', 9], ['APPLIED', 12], ['SAVED', 1], ['READY_TO_APPLY', 3],
  ['SCREENING', 11], ['SCREENING', 16], ['INTERVIEW', 20], ['TECHNICAL_ROUND', 25], ['TECHNICAL_ROUND', 31],
  ['FINAL_ROUND', 38], ['OFFER', 47], ['REJECTED', 15], ['REJECTED', 22], ['REJECTED', 29], ['REJECTED', 41], ['WITHDRAWN', 35], ['APPLIED', 60],
];
const PATH: Record<string, ApplicationStatus[]> = {
  SAVED: ['SAVED'], READY_TO_APPLY: ['SAVED', 'READY_TO_APPLY'], APPLIED: ['SAVED', 'APPLIED'],
  SCREENING: ['APPLIED', 'SCREENING'], INTERVIEW: ['APPLIED', 'SCREENING', 'INTERVIEW'],
  TECHNICAL_ROUND: ['APPLIED', 'SCREENING', 'TECHNICAL_ROUND'], FINAL_ROUND: ['APPLIED', 'SCREENING', 'TECHNICAL_ROUND', 'FINAL_ROUND'],
  OFFER: ['APPLIED', 'SCREENING', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER'], REJECTED: ['APPLIED', 'SCREENING', 'REJECTED'],
  WITHDRAWN: ['APPLIED', 'WITHDRAWN'],
};

router.post('/load', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    if (await prisma.job.count({ where: { userId, isDemo: true } })) throw new AppError('Demo data is already loaded. Remove it first to reload.', 409);

    const now = Date.now();
    const modes: WorkMode[] = ['REMOTE', 'HYBRID', 'ONSITE'];
    const jobIds: string[] = [];

    // 35 jobs: 20 get applications, 15 stay open for browsing
    for (let i = 0; i < COMPANIES.length; i++) {
      const [company, city] = COMPANIES[i]!;
      const [title, skills] = ROLES[i % ROLES.length]!;
      const salaryMin = 600_000 + (i % 7) * 200_000;
      const co = await prisma.company.upsert({
        where: { name: company }, update: {}, create: { name: company, size: ['1-50', '51-200', '201-1000', '1000+'][i % 4] },
      });
      const job = await prisma.job.create({
        data: {
          userId, isDemo: true, title, companyName: company, location: city === 'Remote' ? 'Remote (India)' : `${city}, India`,
          workMode: city === 'Remote' ? 'REMOTE' : modes[i % 3]!, experienceLevel: i % 4 === 0 ? 'SENIOR' : i % 3 === 0 ? 'ENTRY' : 'MID',
          salaryMin, salaryMax: salaryMin + 500_000, skills,
          description: `${company} is hiring a ${title}. You'll build and ship product features using ${skills.slice(0, 3).join(', ')}, collaborate with design and backend teams, and own quality end to end. (Demo listing)`,
          postedAt: new Date(now - ((i * 5) % 40) * DAY),
          companyId: co.id,
        },
      });
      jobIds.push(job.id);
    }

    for (let i = 0; i < APP_PLAN.length; i++) {
      const [status, daysAgo] = APP_PLAN[i]!;
      const appliedAt = new Date(now - daysAgo * DAY);
      const path = PATH[status]!;
      const app = await prisma.application.create({
        data: {
          userId, jobId: jobIds[i]!, status, appliedAt: status === 'SAVED' || status === 'READY_TO_APPLY' ? null : appliedAt,
          followUpAt: status === 'APPLIED' && daysAgo >= 4 ? new Date(now + (i % 3) * DAY) : null,
          source: 'demo',
          statusHistory: {
            create: path.map((s, k) => ({
              fromStatus: k ? path[k - 1]! : null, toStatus: s,
              changedAt: new Date(appliedAt.getTime() + k * Math.max(1, Math.floor(daysAgo / (path.length + 1))) * DAY),
            })),
          },
          noteEntries: i % 4 === 0 ? { create: [{ userId, content: 'Reached out to the recruiter on LinkedIn. (demo note)' }] } : undefined,
        },
      });
      if (['INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER'].includes(status)) {
        const type: InterviewType = status === 'FINAL_ROUND' || status === 'OFFER' ? 'FINAL' : status === 'TECHNICAL_ROUND' ? 'TECHNICAL' : 'HR';
        await prisma.interview.create({
          data: {
            userId, applicationId: app.id, jobId: jobIds[i]!, type,
            status: status === 'OFFER' ? 'COMPLETED' : 'SCHEDULED',
            scheduledAt: new Date(now + (status === 'OFFER' ? -3 : 2 + (i % 5)) * DAY),
          },
        });
      }
    }

    // Example match scores (clearly marked demo) so the match badges/sorting have something to show
    await prisma.jobMatch.createMany({
      data: jobIds.slice(0, 25).map((jobId, i) => ({
        jobId, userId, overallScore: 40 + ((i * 17) % 56), skillScore: 40 + ((i * 11) % 55), experienceScore: 50 + ((i * 7) % 45),
        matchedSkills: ROLES[i % ROLES.length]![1].slice(0, 3), missingSkills: ROLES[i % ROLES.length]![1].slice(3),
        aiExplanation: { demo: true } as Prisma.InputJsonValue,
      })),
    });

    // A little AI usage history for the analytics charts (model 'demo' so it can be removed cleanly)
    const features = ['agent', 'agent', 'resume_analysis', 'job_match', 'cover_letter', 'agent', 'interview_prep'];
    await prisma.aIUsage.createMany({
      data: Array.from({ length: 24 }, (_, i) => {
        const input = 400 + ((i * 331) % 1800);
        const output = 150 + ((i * 197) % 900);
        return {
          userId, feature: features[i % features.length]!, model: 'demo', inputTokens: input, outputTokens: output, totalTokens: input + output, cost: 0,
          createdAt: new Date(now - ((i * 37) % 26) * DAY - i * 3_600_000),
        };
      }),
    });

    res.status(201).json({ success: true, data: { jobs: jobIds.length, applications: APP_PLAN.length } });
  } catch (e) { next(e); }
});

/** Removes only what the demo loader created (jobs flagged isDemo, their applications, demo AI usage). */
router.delete('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const demoJobs = await prisma.job.findMany({ where: { userId, isDemo: true }, select: { id: true } });
    const ids = demoJobs.map(j => j.id);
    await prisma.$transaction([
      prisma.interview.deleteMany({ where: { userId, jobId: { in: ids } } }),
      prisma.application.deleteMany({ where: { userId, jobId: { in: ids } } }),
      prisma.job.deleteMany({ where: { userId, id: { in: ids } } }),
      prisma.aIUsage.deleteMany({ where: { userId, model: 'demo' } }),
    ]);
    res.json({ success: true, data: { removedJobs: ids.length } });
  } catch (e) { next(e); }
});

export default router;
