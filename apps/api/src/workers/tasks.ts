/**
 * Scheduled background tasks. They're plain async functions so tests can call them directly;
 * src/worker.ts runs them on a schedule through BullMQ.
 */
import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { sendMail } from '../lib/mailer';
import { jobAlertEmail, ReminderItem, remindersEmail } from '../lib/emailTemplates';
import { importJobsForUser, readJobSourceSettings } from '../lib/jobImport';

const HOUR = 3_600_000;
const CLOSED = ['OFFER', 'REJECTED', 'WITHDRAWN'] as const;

const fmtWhen = (d: Date, tz: string) =>
  d.toLocaleString('en-IN', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** True if we already notified about this item recently, so reruns never double-notify. */
async function alreadyNotified(userId: string, type: NotificationType, refId: string, withinMs: number): Promise<boolean> {
  return (
    (await prisma.notification.count({
      where: { userId, type, createdAt: { gte: new Date(Date.now() - withinMs) }, data: { path: ['refId'], equals: refId } },
    })) > 0
  );
}

/**
 * Daily: in-app notifications plus one summary email per user for interviews in the next
 * 24 hours and follow-ups that are due. Respects each user's email preferences.
 */
export async function runReminders(now = new Date()): Promise<{ users: number; notifications: number; emails: number }> {
  const soon = new Date(now.getTime() + 24 * HOUR);
  const [interviews, followUps] = await Promise.all([
    prisma.interview.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { gte: now, lt: soon } },
      include: { job: { select: { title: true, companyName: true } }, application: { select: { job: { select: { title: true, companyName: true } } } } },
    }),
    prisma.application.findMany({
      where: { followUpAt: { lte: soon }, status: { notIn: [...CLOSED] } },
      include: { job: { select: { title: true, companyName: true } } },
    }),
  ]);

  const userIds = [...new Set([...interviews.map(i => i.userId), ...followUps.map(a => a.userId)])];
  let notifications = 0;
  let emails = 0;

  for (const userId of userIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailVerified: true, isActive: true, preferences: { select: { emailInterviewReminders: true, timezone: true, automationPaused: true } } },
    });
    if (!user?.isActive || user.preferences?.automationPaused) continue;
    const tz = user.preferences?.timezone || 'Asia/Kolkata';
    const iItems: ReminderItem[] = [];
    const fItems: ReminderItem[] = [];

    for (const i of interviews.filter(x => x.userId === userId)) {
      if (await alreadyNotified(userId, 'INTERVIEW_REMINDER', i.id, 20 * HOUR)) continue;
      const job = i.job ?? i.application?.job;
      const label = job ? `${job.title} at ${job.companyName}` : 'Interview';
      const detail = `${i.type.replace(/_/g, ' ').toLowerCase()} interview, ${fmtWhen(i.scheduledAt!, tz)}`;
      await prisma.notification.create({
        data: { userId, type: 'INTERVIEW_REMINDER', title: `Interview soon: ${label}`, body: detail, data: { refId: i.id, applicationId: i.applicationId } },
      });
      notifications++;
      iItems.push({ label, detail });
    }

    for (const a of followUps.filter(x => x.userId === userId)) {
      // One follow-up nudge per application every 3 days at most
      if (await alreadyNotified(userId, 'FOLLOW_UP_DUE', a.id, 72 * HOUR)) continue;
      const label = `${a.job.title} at ${a.job.companyName}`;
      const detail = a.followUpAt! < now ? 'follow-up overdue' : 'follow-up due today';
      await prisma.notification.create({
        data: { userId, type: 'FOLLOW_UP_DUE', title: `Follow up: ${label}`, body: `Your ${detail}. A short, polite check-in keeps you on their radar.`, data: { refId: a.id, applicationId: a.id } },
      });
      notifications++;
      fItems.push({ label, detail });
    }

    const wantsEmail = user.preferences?.emailInterviewReminders ?? true;
    if (wantsEmail && user.emailVerified && (iItems.length || fItems.length)) {
      if (await sendMail(remindersEmail(user, iItems, fItems))) emails++;
    }
  }

  logger.info({ users: userIds.length, notifications, emails }, 'Reminders run finished');
  return { users: userIds.length, notifications, emails };
}

/**
 * Every 6 hours: for users who turned on "fetch new jobs automatically", import from their
 * chosen sources using their first target role as the search, and tell them what's new.
 */
export async function runJobFetch(): Promise<{ users: number; created: number }> {
  const prefs = await prisma.userPreference.findMany({
    where: { extras: { path: ['autoFetchJobs'], equals: true }, automationPaused: false, user: { isActive: true } },
    select: {
      userId: true, extras: true, emailJobAlerts: true, inAppJobAlerts: true,
      user: { select: { email: true, name: true, emailVerified: true, profile: { select: { targetRoles: true } } } },
    },
  });

  let created = 0;
  for (const p of prefs) {
    try {
      const settings = readJobSourceSettings(p.extras as Record<string, unknown>);
      const search = p.user.profile?.targetRoles[0] ?? '';
      const r = await importJobsForUser(p.userId, settings, search);
      created += r.created;
      if (!r.created) continue;
      if (p.inAppJobAlerts) {
        await prisma.notification.create({
          data: { userId: p.userId, type: 'JOB_MATCH', title: `${r.created} new job${r.created > 1 ? 's' : ''} imported`, body: `From ${settings.sources.join(', ')}${search ? ` for "${search}"` : ''}.`, data: { count: r.created } as Prisma.InputJsonValue },
        });
      }
      if (p.emailJobAlerts && p.user.emailVerified) await sendMail(jobAlertEmail(p.user, r.created));
    } catch (err) {
      logger.warn({ err: (err as Error).message, userId: p.userId }, 'Scheduled job fetch failed for user');
    }
  }
  logger.info({ users: prefs.length, created }, 'Scheduled job fetch finished');
  return { users: prefs.length, created };
}

/** Daily: remove expired sessions and one-time links, and old read notifications. */
export async function runCleanup(now = new Date()): Promise<Record<string, number>> {
  const [refresh, resets, verifications, notifications] = await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    prisma.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.notification.deleteMany({ where: { read: true, createdAt: { lt: new Date(now.getTime() - 90 * 24 * HOUR) } } }),
  ]);
  const out = { refreshTokens: refresh.count, passwordResets: resets.count, emailVerifications: verifications.count, notifications: notifications.count };
  logger.info(out, 'Cleanup finished');
  return out;
}
