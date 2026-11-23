import { Response, NextFunction } from 'express';
import { ApplicationStatus } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { userSkillSet } from '../../lib/match';

const uid = (req: AuthRequest) => req.user!.id;
const DAY = 86_400_000;

/** Statuses meaning an employer has replied (anything past "applied", excluding self-withdrawn). */
const RESPONDED: ApplicationStatus[] = ['SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED'];
const INTERVIEWING: ApplicationStatus[] = ['INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER'];
const SUBMITTED: ApplicationStatus[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN'];
const ACTIVE: ApplicationStatus[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND'];

const weekStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** 0-100 profile completeness used for the onboarding banner and the health score. */
async function profileCompleteness(userId: string) {
  const [profile, resumes] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, include: { _count: { select: { skills: true, experiences: true } } } }),
    prisma.resume.count({ where: { userId } }),
  ]);
  const checks: Array<[string, boolean]> = [
    ['Add a headline', !!profile?.headline],
    ['Write a summary', !!profile?.summary],
    ['Set your location', !!profile?.location],
    ['Add your current role', !!profile?.currentRole],
    ['Add at least 5 skills', (profile?._count.skills ?? 0) >= 5],
    ['Add work experience', (profile?._count.experiences ?? 0) >= 1],
    ['Choose target roles', (profile?.targetRoles.length ?? 0) > 0],
    ['Set salary expectations', (profile?.salaryMax ?? 0) > 0],
    ['Upload a resume', resumes > 0],
    ['Link LinkedIn or GitHub', !!(profile?.linkedinUrl || profile?.githubUrl)],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([label]) => label) };
}

export const analyticsController = {
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const now = Date.now();
      const [totalJobs, apps, resumes, matches, savedJobsWithoutMatch, completeness, profile] = await Promise.all([
        prisma.job.count({ where: { userId } }),
        prisma.application.findMany({
          where: { userId },
          select: {
            id: true, status: true, appliedAt: true, createdAt: true, updatedAt: true, followUpAt: true,
            job: { select: { title: true, companyName: true, company: { select: { logo: true } }, matches: { where: { userId }, select: { overallScore: true } } } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.resume.findMany({ where: { userId }, select: { atsScore: true } }),
        prisma.jobMatch.aggregate({ where: { userId }, _avg: { overallScore: true }, _count: { id: true } }),
        prisma.savedJob.count({ where: { userId, job: { matches: { none: { userId } } } } }),
        profileCompleteness(userId),
        prisma.profile.findUnique({ where: { userId }, select: { _count: { select: { skills: true } } } }),
      ]);

      const byStatus = Object.entries(
        apps.reduce<Record<string, number>>((acc, a) => ((acc[a.status] = (acc[a.status] ?? 0) + 1), acc), {}),
      ).map(([status, count]) => ({ status, _count: { status: count } }));

      const submitted = apps.filter(a => SUBMITTED.includes(a.status));
      const responded = apps.filter(a => RESPONDED.includes(a.status));
      const responseRate = pct(responded.length, submitted.length);
      const weekAgo = now - 7 * DAY;
      const appliedThisWeek = apps.filter(a => (a.appliedAt ?? a.createdAt).getTime() >= weekAgo && SUBMITTED.includes(a.status)).length;

      // ── Career health score: four equally weighted 0-100 components ──
      const bestAts = Math.max(0, ...resumes.map(r => r.atsScore ?? 0));
      const resumeScore = resumes.length ? clamp(bestAts || 40) : 0; // an un-analysed resume counts for 40
      const frequencyScore = clamp((appliedThisWeek / 5) * 100); // target: 5 applications a week
      const responseScore = clamp((responseRate / 30) * 100); // a 30% response rate is excellent
      const matchScore = clamp(matches._avg.overallScore ?? 0);
      const healthScore = Math.round((resumeScore + frequencyScore + responseScore + matchScore) / 4);

      const stale = apps.filter(a => ACTIVE.includes(a.status) && now - a.updatedAt.getTime() > 7 * DAY);
      const dueFollowUps = apps.filter(a => a.followUpAt && a.followUpAt.getTime() <= now + DAY && ACTIVE.includes(a.status));
      const followUps = new Set([...stale, ...dueFollowUps].map(a => a.id)).size;

      const goals = [
        { id: 'apply', title: 'Apply to 5 jobs', progress: Math.min(appliedThisWeek, 5), target: 5, link: '/jobs' },
        followUps > 0
          ? { id: 'followup', title: `Follow up on ${Math.min(followUps, 3)} application${Math.min(followUps, 3) === 1 ? '' : 's'}`, progress: 0, target: Math.min(followUps, 3), link: '/applications' }
          : { id: 'match', title: savedJobsWithoutMatch ? `Check your match for ${Math.min(savedJobsWithoutMatch, 3)} saved jobs` : 'Save 3 jobs that fit you', progress: 0, target: Math.min(Math.max(savedJobsWithoutMatch, 3), 3), link: '/jobs' },
        (profile?._count.skills ?? 0) < 8 || !resumes.some(r => r.atsScore != null)
          ? { id: 'resume', title: resumes.some(r => r.atsScore != null) ? 'Update your skills section' : 'Analyze your resume', progress: 0, target: 1, link: resumes.length ? '/resumes' : '/profile' }
          : { id: 'ai', title: 'Ask the AI agent for this week’s plan', progress: 0, target: 1, link: '/ai' },
      ];

      res.json({
        success: true,
        data: {
          kpis: { totalJobs, totalApplications: apps.length, totalResumes: resumes.length, responseRate },
          applicationsByStatus: byStatus,
          recentApplications: apps.slice(0, 5).map(a => ({
            id: a.id, status: a.status, appliedAt: a.appliedAt, updatedAt: a.updatedAt,
            matchScore: a.job.matches[0] ? Math.round(a.job.matches[0].overallScore) : null,
            job: { title: a.job.title, companyName: a.job.companyName, logo: a.job.company?.logo ?? null },
          })),
          health: {
            score: healthScore,
            components: [
              { key: 'resume', label: 'Resume', score: resumeScore, hint: resumes.length ? 'Analyze your resume to improve this' : 'Upload a resume' },
              { key: 'frequency', label: 'Application activity', score: frequencyScore, hint: `${appliedThisWeek}/5 applications this week` },
              { key: 'response', label: 'Response rate', score: responseScore, hint: `${responseRate}% of applications got a reply` },
              { key: 'match', label: 'AI match quality', score: matchScore, hint: matches._count.id ? `Average match ${matchScore}/100` : 'Run a match on a job to score this' },
            ],
          },
          goals,
          profile: completeness,
        },
      });
    } catch (e) { next(e); }
  },

  /** One endpoint powering every chart on the analytics page. */
  async getOverview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const range = String((req.query as Record<string, string>)['range'] ?? '30');
      const days = range === 'all' ? null : Math.min(parseInt(range) || 30, 365);
      const since = days ? new Date(Date.now() - days * DAY) : null;

      const apps = await prisma.application.findMany({
        where: { userId, ...(since ? { OR: [{ appliedAt: { gte: since } }, { appliedAt: null, createdAt: { gte: since } }] } : {}) },
        select: {
          id: true, status: true, appliedAt: true, createdAt: true,
          statusHistory: { select: { toStatus: true } },
          interviews: { select: { id: true } },
          job: { select: { companyName: true, skills: true } },
        },
      });
      const when = (a: { appliedAt: Date | null; createdAt: Date }) => a.appliedAt ?? a.createdAt;

      // Status distribution
      const counts: Record<string, number> = {};
      for (const a of apps) counts[a.status] = (counts[a.status] ?? 0) + 1;
      const byStatus = Object.entries(counts).map(([status, count]) => ({ status, count }));

      // Weekly trend (applications + response rate), one point per week in range
      const firstWeek = weekStart(since ?? (apps.length ? new Date(Math.min(...apps.map(a => when(a).getTime()))) : new Date()));
      const weeks: Array<{ week: string; applications: number; responses: number; responseRate: number }> = [];
      for (let d = new Date(firstWeek); d.getTime() <= Date.now() && weeks.length < 60; d = new Date(d.getTime() + 7 * DAY)) {
        weeks.push({ week: iso(d), applications: 0, responses: 0, responseRate: 0 });
      }
      for (const a of apps) {
        if (!SUBMITTED.includes(a.status) && a.status !== 'SAVED') continue;
        const slot = weeks.find(w => w.week === iso(weekStart(when(a))));
        if (!slot) continue;
        slot.applications++;
        if (RESPONDED.includes(a.status)) slot.responses++;
      }
      for (const w of weeks) w.responseRate = pct(w.responses, w.applications);

      // Funnel uses "ever reached" so an application that later got rejected still counts at its peak stage
      const reached = (a: (typeof apps)[number], set: ApplicationStatus[]) => set.includes(a.status) || a.statusHistory.some(h => set.includes(h.toStatus));
      const applied = apps.filter(a => reached(a, SUBMITTED)).length;
      const gotResponse = apps.filter(a => reached(a, RESPONDED) || a.interviews.length > 0).length;
      const interviewed = apps.filter(a => reached(a, INTERVIEWING) || a.interviews.length > 0).length;
      const offers = apps.filter(a => reached(a, ['OFFER'])).length;
      const funnel = [
        { stage: 'Applications', count: applied, conversion: 100 },
        { stage: 'Responses', count: gotResponse, conversion: pct(gotResponse, applied) },
        { stage: 'Interviews', count: interviewed, conversion: pct(interviewed, gotResponse) },
        { stage: 'Offers', count: offers, conversion: pct(offers, interviewed) },
      ];

      // Top companies
      const byCompany: Record<string, number> = {};
      for (const a of apps) byCompany[a.job.companyName] = (byCompany[a.job.companyName] ?? 0) + 1;
      const topCompanies = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([company, count]) => ({ company, count }));

      // Skills gap: most demanded skills across saved + applied jobs vs what the user has
      const [savedJobs, userSkills] = await Promise.all([
        prisma.savedJob.findMany({ where: { userId }, select: { job: { select: { skills: true } } } }),
        userSkillSet(userId),
      ]);
      const demand: Record<string, number> = {};
      for (const s of [...savedJobs.map(j => j.job.skills), ...apps.map(a => a.job.skills)].flat()) demand[s] = (demand[s] ?? 0) + 1;
      const top = Object.entries(demand).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const maxDemand = top[0]?.[1] ?? 1;
      const norm = (s: string) => s.trim().toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9+#]/g, '');
      const skillsGap = top.map(([skill, n]) => ({ skill, demand: Math.round((n / maxDemand) * 100), you: userSkills.has(norm(skill)) ? 100 : 0 }));

      // AI usage over the last 30 days: per day + per feature
      const from = new Date(Date.now() - 29 * DAY);
      from.setHours(0, 0, 0, 0);
      const usage = await prisma.aIUsage.findMany({ where: { userId, createdAt: { gte: from } }, select: { feature: true, totalTokens: true, createdAt: true } });
      const perDay: Record<string, { requests: number; tokens: number }> = {};
      const perFeature: Record<string, number> = {};
      for (const u of usage) {
        const k = iso(u.createdAt);
        perDay[k] = { requests: (perDay[k]?.requests ?? 0) + 1, tokens: (perDay[k]?.tokens ?? 0) + u.totalTokens };
        perFeature[u.feature] = (perFeature[u.feature] ?? 0) + u.totalTokens;
      }
      const aiPerDay = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(from.getTime() + i * DAY);
        return { day: iso(d).slice(5), requests: perDay[iso(d)]?.requests ?? 0, tokens: perDay[iso(d)]?.tokens ?? 0 };
      });
      const used = usage.reduce((s, u) => s + u.totalTokens, 0);

      res.json({
        success: true,
        data: {
          range, total: apps.length,
          responseRate: pct(gotResponse, applied),
          byStatus, weeks, funnel, topCompanies, skillsGap,
          ai: {
            perDay: aiPerDay,
            byFeature: Object.entries(perFeature).map(([feature, tokens]) => ({ feature, tokens })).sort((a, b) => b.tokens - a.tokens),
            requests: usage.length, tokens: used, budgetTokens: env.AI_MONTHLY_BUDGET_TOKENS,
          },
        },
      });
    } catch (e) { next(e); }
  },

  async getApplicationStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const [byStatus, responded, total] = await Promise.all([
        prisma.application.groupBy({ by: ['status'], where: { userId }, _count: { status: true } }),
        prisma.application.count({ where: { userId, status: { in: RESPONDED } } }),
        prisma.application.count({ where: { userId } }),
      ]);
      res.json({ success: true, data: { byStatus, responseRate: pct(responded, total), total } });
    } catch (e) { next(e); }
  },

  async getJobStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const [total, saved, matches] = await Promise.all([
        prisma.job.count({ where: { userId } }),
        prisma.savedJob.count({ where: { userId } }),
        prisma.jobMatch.aggregate({ where: { userId }, _avg: { overallScore: true }, _count: { id: true } }),
      ]);
      res.json({ success: true, data: { total, saved, avgMatchScore: Math.round(matches._avg.overallScore ?? 0), matchedJobs: matches._count.id } });
    } catch (e) { next(e); }
  },

  async getAIUsage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const since = new Date(Date.now() - 30 * DAY);
      const [total, byFeature] = await Promise.all([
        prisma.aIUsage.aggregate({ where: { userId }, _sum: { totalTokens: true, cost: true }, _count: { id: true } }),
        prisma.aIUsage.groupBy({ by: ['feature'], where: { userId, createdAt: { gte: since } }, _sum: { totalTokens: true }, _count: { id: true } }),
      ]);
      res.json({ success: true, data: { total: total._sum, requestCount: total._count.id, byFeature } });
    } catch (e) { next(e); }
  },
};
