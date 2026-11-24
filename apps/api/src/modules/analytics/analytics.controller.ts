import { Response, NextFunction } from 'express';
import { ApplicationStatus } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { quickMatch, userSkillSet } from '../../lib/match';
import { topSkills } from '../../lib/atsScore';

const uid = (req: AuthRequest) => req.user!.id;
const DAY = 86_400_000;

/** Statuses meaning an employer has replied (anything past "applied", excluding self-withdrawn). */
const RESPONDED: ApplicationStatus[] = ['ASSESSMENT', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED'];
const INTERVIEWING: ApplicationStatus[] = ['INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER'];
const SUBMITTED: ApplicationStatus[] = ['APPLIED', 'ASSESSMENT', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN'];
const ACTIVE: ApplicationStatus[] = ['APPLIED', 'ASSESSMENT', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND'];

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
      const [totalJobs, apps, resumes, matches, savedJobsWithoutMatch, completeness, profile, upcoming, history, recentJobs, skills, searches] = await Promise.all([
        prisma.job.count({ where: { userId, duplicateOfId: null } }),
        prisma.application.findMany({
          where: { userId },
          select: {
            id: true, status: true, appliedAt: true, createdAt: true, updatedAt: true, followUpAt: true,
            job: { select: { title: true, companyName: true, company: { select: { logo: true } }, matches: { where: { userId }, select: { overallScore: true } } } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.resume.findMany({ where: { userId }, select: { id: true, name: true, atsScore: true, isDefault: true } }),
        prisma.jobMatch.aggregate({ where: { userId }, _avg: { overallScore: true }, _count: { id: true } }),
        prisma.savedJob.count({ where: { userId, job: { matches: { none: { userId } } } } }),
        profileCompleteness(userId),
        prisma.profile.findUnique({ where: { userId }, select: { _count: { select: { skills: true } } } }),
        prisma.interview.findMany({
          where: { userId, status: { in: ['SCHEDULED', 'RESCHEDULED'] }, scheduledAt: { gte: new Date(now - 2 * 3_600_000) } },
          orderBy: { scheduledAt: 'asc' },
          take: 5,
          select: {
            id: true, type: true, scheduledAt: true, meetingUrl: true, location: true, applicationId: true,
            application: { select: { job: { select: { title: true, companyName: true } } } },
            job: { select: { title: true, companyName: true } },
          },
        }),
        prisma.applicationStatusHistory.findMany({
          where: { application: { userId } },
          orderBy: { changedAt: 'desc' },
          take: 8,
          select: { id: true, fromStatus: true, toStatus: true, changedAt: true, applicationId: true, application: { select: { job: { select: { title: true, companyName: true } } } } },
        }),
        // Jobs from the last 30 days drive the market insights and recommendations
        prisma.job.findMany({
          where: { userId, isActive: true, duplicateOfId: null, isDemo: false, createdAt: { gte: new Date(now - 30 * DAY) } },
          select: { id: true, title: true, companyName: true, skills: true, workMode: true, indiaEligible: true, applications: { where: { userId }, select: { id: true } } },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        userSkillSet(userId),
        prisma.jobSearch.count({ where: { userId, name: { not: null }, alertEnabled: true } }),
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

      // ── Command-center extras (all from the user's own records) ──
      const interviewing = apps.filter(a => INTERVIEWING.includes(a.status) && a.status !== 'OFFER').length;
      const offers = apps.filter(a => a.status === 'OFFER').length;
      const rejections = apps.filter(a => a.status === 'REJECTED').length;

      const weekly = Array.from({ length: 8 }, (_, i) => {
        const start = weekStart(new Date(now - (7 - i) * 7 * DAY));
        return { week: iso(start), applications: 0, responses: 0 };
      });
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now);
        d.setDate(1);
        d.setMonth(d.getMonth() - (5 - i));
        return { month: iso(d).slice(0, 7), applications: 0, interviews: 0, offers: 0 };
      });
      for (const a of apps) {
        if (!SUBMITTED.includes(a.status)) continue;
        const t = a.appliedAt ?? a.createdAt;
        const w = weekly.find(x => x.week === iso(weekStart(t)));
        if (w) { w.applications++; if (RESPONDED.includes(a.status)) w.responses++; }
        const m = months.find(x => x.month === iso(t).slice(0, 7));
        if (m) { m.applications++; if (INTERVIEWING.includes(a.status)) m.interviews++; if (a.status === 'OFFER') m.offers++; }
      }

      const market = topSkills(recentJobs, 10).map(t => ({ ...t, youHave: skills.has(t.skill.trim().toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9+#]/g, '')) }));
      const remoteJobs = recentJobs.filter(j => j.workMode === 'REMOTE');
      const marketInsights = {
        jobs: recentJobs.length,
        topSkills: market,
        remoteShare: pct(remoteJobs.length, recentJobs.length),
        indiaEligibleRemote: remoteJobs.filter(j => j.indiaEligible === true).length,
      };

      const defaultResume = resumes.find(r => r.isDefault) ?? resumes[0];
      const bestFits = recentJobs
        .filter(j => !j.applications.length && j.skills.length >= 3)
        .map(j => ({ id: j.id, title: j.title, companyName: j.companyName, score: quickMatch(j.skills, skills).score }))
        .filter(j => j.score >= 60)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const missingTop = market.filter(m => !m.youHave && m.count >= 2).slice(0, 3).map(m => m.skill);
      const recommendations: Array<{ id: string; title: string; detail: string; link: string }> = [];
      if (!resumes.length) recommendations.push({ id: 'upload', title: 'Upload your resume', detail: 'Matching, ATS checks and tailoring all start from your resume.', link: '/resumes' });
      else if ((defaultResume?.atsScore ?? 0) < 70) recommendations.push({ id: 'ats', title: `Raise your ATS score${defaultResume?.atsScore != null ? ` from ${defaultResume.atsScore}` : ''}`, detail: 'Open the resume analysis to see which checks fail, or create an AI-improved version.', link: '/resumes' });
      if (bestFits.length) recommendations.push({ id: 'fits', title: `Apply to ${bestFits.length} strong match${bestFits.length === 1 ? '' : 'es'}`, detail: bestFits.map(j => `${j.title} at ${j.companyName} (${j.score}%)`).join(' · '), link: '/jobs' });
      if (followUps) recommendations.push({ id: 'follow', title: `Follow up on ${followUps} application${followUps === 1 ? '' : 's'}`, detail: 'No update in over a week, or a follow-up date is due.', link: '/applications' });
      if (missingTop.length) recommendations.push({ id: 'skills', title: `Learn or add: ${missingTop.join(', ')}`, detail: `Asked for by several of your recent jobs and missing from your profile and resume.`, link: '/profile' });
      if (!searches && totalJobs > 0) recommendations.push({ id: 'alerts', title: 'Turn on a job alert', detail: 'Save a search on the Jobs page and get notified about new matches.', link: '/jobs' });

      const activity = history.map(h => ({
        id: h.id, applicationId: h.applicationId, at: h.changedAt, from: h.fromStatus, to: h.toStatus,
        title: h.application.job.title, company: h.application.job.companyName,
      }));

      res.json({
        success: true,
        data: {
          kpis: { totalJobs, totalApplications: apps.length, totalResumes: resumes.length, responseRate, interviewing, offers, rejections, bestAts: bestAts || null, appliedThisWeek },
          upcomingInterviews: upcoming.map(i => ({
            id: i.id, type: i.type, scheduledAt: i.scheduledAt, meetingUrl: i.meetingUrl, location: i.location, applicationId: i.applicationId,
            title: i.application?.job.title ?? i.job?.title ?? 'Interview', company: i.application?.job.companyName ?? i.job?.companyName ?? '',
          })),
          activity,
          weekly,
          monthly: months,
          marketInsights,
          recommendations: recommendations.slice(0, 5),
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
      const q = req.query as Record<string, string>;
      // A custom from/to (YYYY-MM-DD) wins over the preset range
      const parseDay = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(`${v}T00:00:00Z`) : null);
      const fromQ = parseDay(q['from']);
      const toQ = parseDay(q['to']);
      if (fromQ && toQ && fromQ > toQ) throw new AppError('“From” must be before “to”', 400, 'VALIDATION_ERROR');
      const range = fromQ || toQ ? 'custom' : String(q['range'] ?? '30');
      const days = range === 'all' || range === 'custom' ? null : Math.min(parseInt(range) || 30, 365);
      const since = fromQ ?? (days ? new Date(Date.now() - days * DAY) : null);
      const until = toQ ? new Date(toQ.getTime() + DAY) : null; // inclusive end day

      const apps = await prisma.application.findMany({
        where: {
          userId,
          ...(since || until ? {
            OR: [
              { appliedAt: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } },
              { appliedAt: null, createdAt: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } },
            ],
          } : {}),
        },
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
      const lastDay = until ? until.getTime() - 1 : Date.now();
      for (let d = new Date(firstWeek); d.getTime() <= lastDay && weeks.length < 60; d = new Date(d.getTime() + 7 * DAY)) {
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

      // Discovered vs applied per week, match trend, monthly progress and interview success
      const dateFilter = { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) };
      const [discovered, matchRows] = await Promise.all([
        prisma.job.findMany({ where: { userId, duplicateOfId: null, isDemo: false, ...(since || until ? { createdAt: dateFilter } : {}) }, select: { createdAt: true } }),
        prisma.jobMatch.findMany({ where: { userId, ...(since || until ? { createdAt: dateFilter } : {}) }, select: { createdAt: true, overallScore: true } }),
      ]);
      const discovery = weeks.map(w => ({ week: w.week, discovered: 0, applied: w.applications }));
      for (const j of discovered) {
        const slot = discovery.find(w => w.week === iso(weekStart(j.createdAt)));
        if (slot) slot.discovered++;
      }
      const matchTrend = weeks.map(w => ({ week: w.week, avgMatch: null as number | null, matches: 0 }));
      const sums = new Map<string, number>();
      for (const m of matchRows) {
        const k = iso(weekStart(m.createdAt));
        const slot = matchTrend.find(w => w.week === k);
        if (!slot) continue;
        slot.matches++;
        sums.set(k, (sums.get(k) ?? 0) + m.overallScore);
      }
      for (const w of matchTrend) if (w.matches) w.avgMatch = Math.round(sums.get(w.week)! / w.matches);

      const monthMap = new Map<string, { month: string; applications: number; interviews: number; offers: number }>();
      for (const a of apps) {
        if (!reached(a, SUBMITTED)) continue;
        const k = iso(when(a)).slice(0, 7);
        const m = monthMap.get(k) ?? { month: k, applications: 0, interviews: 0, offers: 0 };
        m.applications++;
        if (reached(a, INTERVIEWING) || a.interviews.length) m.interviews++;
        if (reached(a, ['OFFER'])) m.offers++;
        monthMap.set(k, m);
      }
      const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
      const rates = {
        discoveredToApplied: pct(applied, discovered.length),
        responseRate: pct(gotResponse, applied),
        interviewRate: pct(interviewed, applied),
        interviewSuccess: pct(offers, interviewed),
        offerRate: pct(offers, applied),
      };

      res.json({
        success: true,
        data: {
          range, from: since ? iso(since) : null, to: until ? iso(new Date(until.getTime() - DAY)) : null,
          discoveredCount: discovered.length, discovery, matchTrend, monthly, rates,
          total: apps.length,
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
