import './env';
import pino from 'pino';
import { jobFetchWorker } from './jobs/jobFetch.worker';
import { jobMatchWorker } from './jobs/jobMatch.worker';
import { resumeParseWorker } from './jobs/resumeParse.worker';
import { notificationsWorker } from './jobs/notifications.worker';
import { remindersWorker } from './jobs/reminders.worker';
import { scheduleRecurringJobs } from './scheduler';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

async function main() {
  logger.info('🚀 CareerOS Workers starting...');

  const workers = [
    jobFetchWorker,
    jobMatchWorker,
    resumeParseWorker,
    notificationsWorker,
    remindersWorker,
  ];

  for (const worker of workers) {
    worker.on('completed', job => {
      logger.info({ jobId: job.id, queue: worker.name }, 'Job completed');
    });
    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, queue: worker.name, err: err.message }, 'Job failed');
    });
    logger.info({ queue: worker.name }, 'Worker started');
  }

  await scheduleRecurringJobs();
  logger.info('📅 Recurring jobs scheduled');

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await Promise.all(workers.map(w => w.close()));
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  pino().error(err, 'Worker startup failed');
  process.exit(1);
});
