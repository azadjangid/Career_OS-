import { Worker, Job, Queue } from 'bullmq';
import pino from 'pino';
import { prisma } from '../prisma';
import { getConnectionOptions } from '../redis';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export const remindersWorker = new Worker<Record<string, unknown>>(
  'reminders',
  async (_job: Job) => {
    const notifQueue = new Queue('notifications', getConnectionOptions());

    try {
      // Send interview reminders for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const interviews = await prisma.interview.findMany({
        where: {
          scheduledAt: { gte: tomorrow, lt: dayAfter },
          status: 'SCHEDULED',
        },
        include: { application: { include: { job: true, user: true } } },
      });

      for (const interview of interviews) {
        await notifQueue.add('interview-reminder', {
          userId: interview.application.userId,
          type: 'INTERVIEW_REMINDER',
          data: {
            role: interview.application.job.title,
            company: interview.application.job.companyName,
            scheduledAt: interview.scheduledAt,
            interviewType: interview.type,
          },
        });
      }

      // Remind users with stale applications (> 14 days no update)
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const staleApps = await prisma.application.groupBy({
        by: ['userId'],
        where: {
          status: { in: ['APPLIED', 'PHONE_SCREEN'] },
          updatedAt: { lt: twoWeeksAgo },
        },
        _count: true,
      });

      for (const group of staleApps) {
        await notifQueue.add('stale-application-reminder', {
          userId: group.userId,
          type: 'APPLICATION_UPDATE',
          data: {
            count: group._count,
            message: 'You have applications that haven\'t been updated in 2 weeks',
          },
        });
      }

      logger.info({ interviews: interviews.length, staleApps: staleApps.length }, 'Reminders sent');
      return { interviews: interviews.length, staleApps: staleApps.length };
    } finally {
      await notifQueue.close();
    }
  },
  { ...getConnectionOptions(), concurrency: 1 }
);
