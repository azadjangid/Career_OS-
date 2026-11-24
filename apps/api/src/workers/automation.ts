/**
 * Scheduled automation: saved-search alerts, the daily summary, the weekly progress report and
 * resume nudges. Every task only reads the user's data and writes notifications or emails.
 * Nothing here ever submits a job application or contacts an employer on the user's behalf.
 *
 * Each task skips users who paused automation, respects their per-feature switches, uses a
 * reference id per run so a retried run never notifies twice, and isolates failures per user.
 */
import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { sendMail } from '../lib/mailer';
import { digestEmail } from '../lib/emailTemplates';
import { buildJobWhere } from '../lib/jobQuery';
import { quickMatch, userSkillSet } from '../lib/match';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ACTIVE_STATUSES = ['APPLIED', 'ASSESSMENT', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND'] as const;
const RESPONDED = ['ASSESSMENT', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED'] as const;
const INTERVIEWING = ['INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND'] as const;

const userSelect = { id: true, email: true, name: true, emailVerified: true, isActive: true, createdAt: true } as const;

/** Users whose automation is on, with their preferences. Users without a preference row get the defaults. */
async function activeUsers() {
  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ preferences: null }, { preferences: { automationPaused: false } }] },
    select: { ...userSelect, preferences: true },
  });
  return users;
}

async function notifiedWith(userId: string, type: NotificationType, refId: string): Promise<boolean> {
  return (await prisma.notification.count({ where: { userId, type, data: { path: ['refId'], equals: refId } } })) > 0;
}

/** Calendar day in the user's timezone, used as the once-per-day key. */
const dayKey = (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz || 'Asia/Kolkata' });

async function eachUser<T>(label: string, users: T[], fn: (u: T) => Promise<boolean>): Promise<number> {
  let sent = 0;
  for (const u of users) {
    try {
      if (await fn(u)) sent++;
    } catch (err) {
      logger.warn({ err: (err as Error).message, task: label }, 'Automation step failed for one user');
    }
  }
  return sent;
}

/** New jobs matching each saved search that has its alert on, since that search last notified. */
export async function runSearchAlerts(now = new Date()): Promise<{ searches: number; notified: number }> {
  const searches = await prisma.jobSearch.findMany({
    where: { alertEnabled: true, name: { not: null }, user: { isActive: true, OR: [{ preferences: null }, { preferences: { automationPaused: false } }] } },
    include: { user: { select: { ...userSelect, preferences: { select: { emailJobAlerts: true, inAppJobAlerts: true } } } } },
  });
  const notified = await eachUser('search-alerts', searches, async s => {
    const since = s.lastNotifiedAt ?? s.lastRunAt ?? s.createdAt;
    const where = buildJobWhere(s.userId, (s.filters ?? {}) as Record<string, string>, [{ createdAt: { gt: since, lte: now } }]);
    const [count, top] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({ where, select: { title: true, companyName: true }, orderBy: { createdAt: 'desc' }, take: 3 }),
    ]);
    await prisma.jobSearch.update({ where: { id: s.id }, data: { lastRunAt: now, resultCount: count, ...(count ? { lastNotifiedAt: now } : {}) } });
    if (!count) return false;
    const refId = `search:${s.id}:${now.toISOString()}`;
    const lines = top.map(j => `${j.title} at ${j.companyName}`);
    const inApp = s.user.preferences?.inAppJobAlerts ?? true;
    if (inApp) {
      await prisma.notification.create({
        data: {
          userId: s.userId, type: 'JOB_MATCH', title: `${count} new job${count === 1 ? '' : 's'} for “${s.name}”`,
          body: lines.join(' · ') + (count > lines.length ? ` and ${count - lines.length} more` : ''),
          data: { refId, searchId: s.id, filters: s.filters } as Prisma.InputJsonValue,
        },
      });
    }
    if ((s.user.preferences?.emailJobAlerts ?? true) && s.user.emailVerified) {
      await sendMail(digestEmail(s.user, {
        subject: `${count} new job${count === 1 ? '' : 's'} for “${s.name}”`, title: 'New jobs for your saved search',
        intro: `your saved search “${s.name}” has ${count} new match${count === 1 ? '' : 'es'}:`, lines, cta: { label: 'View jobs', path: '/jobs' },
      }));
    }
    return true;
  });
  logger.info({ searches: searches.length, notified }, 'Saved-search alerts finished');
  return { searches: searches.length, notified };
}

/** Morning summary: jobs added in the last day, strong matches, follow-ups due and interviews in the next two days. */
export async function runDailySummary(now = new Date()): Promise<{ users: number; sent: number }> {
  const users = (await activeUsers()).filter(u => u.preferences?.dailySummary ?? true);
  const sent = await eachUser('daily-summary', users, async u => {
    const tz = u.preferences?.timezone ?? 'Asia/Kolkata';
    const refId = `daily:${dayKey(now, tz)}`;
    if (await notifiedWith(u.id, 'SYSTEM', refId)) return false;
    const minScore = u.preferences?.jobAlertMinMatchScore ?? 70;
    const [newJobs, followUps, interviews, skills] = await Promise.all([
      prisma.job.findMany({ where: { userId: u.id, isActive: true, duplicateOfId: null, createdAt: { gte: new Date(now.getTime() - DAY), lte: now } }, select: { title: true, companyName: true, skills: true } }),
      prisma.application.count({ where: { userId: u.id, status: { in: [...ACTIVE_STATUSES] }, followUpAt: { lte: new Date(now.getTime() + DAY) } } }),
      prisma.interview.count({ where: { userId: u.id, status: { in: ['SCHEDULED', 'RESCHEDULED'] }, scheduledAt: { gte: now, lte: new Date(now.getTime() + 2 * DAY) } } }),
      userSkillSet(u.id),
    ]);
    const strong = newJobs.map(j => ({ j, s: quickMatch(j.skills, skills) })).filter(x => x.s.total >= 3 && x.s.score >= minScore).sort((a, b) => b.s.score - a.s.score);
    if (!newJobs.length && !followUps && !interviews) return false;

    const lines = [
      newJobs.length ? `${newJobs.length} new job${newJobs.length === 1 ? '' : 's'} added` : null,
      strong.length ? `${strong.length} strong match${strong.length === 1 ? '' : 'es'} (${minScore}%+): ${strong.slice(0, 3).map(x => `${x.j.title} at ${x.j.companyName} (${x.s.score}%)`).join(', ')}` : null,
      followUps ? `${followUps} follow-up${followUps === 1 ? '' : 's'} due` : null,
      interviews ? `${interviews} interview${interviews === 1 ? '' : 's'} in the next 2 days` : null,
    ].filter((l): l is string => !!l);
    await prisma.notification.create({ data: { userId: u.id, type: 'SYSTEM', title: 'Your daily job summary', body: lines.join(' · '), data: { refId, kind: 'daily_summary' } } });
    if (u.preferences?.emailDailySummary && u.emailVerified) {
      await sendMail(digestEmail(u, { subject: 'Your daily job summary', title: 'Today in your job search', intro: 'here is what changed since yesterday:', lines, cta: { label: 'Open dashboard', path: '/dashboard' } }));
    }
    return true;
  });
  logger.info({ users: users.length, sent }, 'Daily summary finished');
  return { users: users.length, sent };
}

/** Monday report: the last 7 days compared with the week before. */
export async function runWeeklyReport(now = new Date()): Promise<{ users: number; sent: number }> {
  const users = (await activeUsers()).filter(u => u.preferences?.weeklyReport ?? true);
  const sent = await eachUser('weekly-report', users, async u => {
    const tz = u.preferences?.timezone ?? 'Asia/Kolkata';
    const refId = `weekly:${dayKey(now, tz)}`;
    if (await notifiedWith(u.id, 'AI_INSIGHT', refId)) return false;
    const week = (from: number, to: number) => ({ gte: new Date(now.getTime() - from * DAY), lt: new Date(now.getTime() - to * DAY) });
    const count = async (range: { gte: Date; lt: Date }) => {
      const [applied, responses, interviews, offers, jobs] = await Promise.all([
        prisma.application.count({ where: { userId: u.id, appliedAt: range } }),
        prisma.applicationStatusHistory.count({ where: { application: { userId: u.id }, changedAt: range, toStatus: { in: [...RESPONDED] } } }),
        prisma.applicationStatusHistory.count({ where: { application: { userId: u.id }, changedAt: range, toStatus: { in: [...INTERVIEWING] } } }),
        prisma.applicationStatusHistory.count({ where: { application: { userId: u.id }, changedAt: range, toStatus: 'OFFER' } }),
        prisma.job.count({ where: { userId: u.id, duplicateOfId: null, createdAt: range } }),
      ]);
      return { applied, responses, interviews, offers, jobs };
    };
    const [cur, prev] = await Promise.all([count(week(7, 0)), count(week(14, 7))]);
    if (!cur.applied && !cur.responses && !cur.jobs && !prev.applied) return false;
    const delta = (a: number, b: number) => (a === b ? '' : a > b ? ` (up from ${b})` : ` (down from ${b})`);
    const lines = [
      `${cur.applied} application${cur.applied === 1 ? '' : 's'} sent${delta(cur.applied, prev.applied)}`,
      `${cur.responses} employer repl${cur.responses === 1 ? 'y' : 'ies'}${delta(cur.responses, prev.responses)}`,
      `${cur.interviews} moved to interview${cur.offers ? `, ${cur.offers} offer${cur.offers === 1 ? '' : 's'}` : ''}`,
      `${cur.jobs} new job${cur.jobs === 1 ? '' : 's'} found`,
    ];
    if (cur.applied < 5) lines.push(`Aim for 5 applications this week: ${5 - cur.applied} to go.`);
    await prisma.notification.create({ data: { userId: u.id, type: 'AI_INSIGHT', title: 'Your weekly progress report', body: lines.join(' · '), data: { refId, kind: 'weekly_report', current: cur, previous: prev } } });
    if (u.preferences?.emailWeeklySummary && u.emailVerified) {
      await sendMail(digestEmail(u, { subject: 'Your weekly progress report', title: 'Your week in review', intro: 'here is your last 7 days:', lines, cta: { label: 'Open analytics', path: '/analytics' } }));
    }
    return true;
  });
  logger.info({ users: users.length, sent }, 'Weekly report finished');
  return { users: users.length, sent };
}

/** At most every 14 days: a nudge when the user has no resume, a low ATS score, or a resume untouched for 90 days. */
export async function runResumeNudges(now = new Date()): Promise<{ users: number; sent: number }> {
  const users = (await activeUsers()).filter(u => (u.preferences?.resumeNudges ?? true) && now.getTime() - u.createdAt.getTime() > 3 * DAY);
  const sent = await eachUser('resume-nudges', users, async u => {
    const recent = await prisma.notification.count({ where: { userId: u.id, type: 'AI_INSIGHT', createdAt: { gte: new Date(now.getTime() - 14 * DAY) }, data: { path: ['kind'], equals: 'resume_nudge' } } });
    if (recent) return false;
    const resume = await prisma.resume.findFirst({ where: { userId: u.id }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }], select: { id: true, name: true, atsScore: true, updatedAt: true } });
    let title: string | null = null;
    let body = '';
    if (!resume) { title = 'Upload your resume'; body = 'Job matching, ATS checks, tailoring and cover letters all work from your resume.'; }
    else if (resume.atsScore != null && resume.atsScore < 60) { title = `Your resume scores ${resume.atsScore}/100 on the ATS check`; body = `Open “${resume.name}” → Analysis to see which checks fail, or create an AI-improved version.`; }
    else if (now.getTime() - resume.updatedAt.getTime() > 90 * DAY) { title = 'Your resume hasn’t changed in 3 months'; body = `Add your latest work to “${resume.name}” so new matches reflect it.`; }
    if (!title) return false;
    await prisma.notification.create({ data: { userId: u.id, type: 'AI_INSIGHT', title, body, data: { refId: `resume:${dayKey(now, 'UTC')}`, kind: 'resume_nudge', resumeId: resume?.id ?? null } } });
    return true;
  });
  logger.info({ users: users.length, sent }, 'Resume nudges finished');
  return { users: users.length, sent };
}
