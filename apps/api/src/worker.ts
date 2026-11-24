/**
 * Background worker: runs the scheduled tasks in src/workers/tasks.ts through BullMQ (Redis).
 * Start with `npm run worker` (dev: `npm run dev:worker`). Run exactly one scheduler-enabled
 * worker; more workers can be added for throughput since BullMQ hands each run to one of them.
 */
import { Queue, Worker } from 'bullmq';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initSentry, captureError } from './lib/sentry';
import { runCleanup, runJobFetch, runReminders } from './workers/tasks';
import { runDailySummary, runResumeNudges, runSearchAlerts, runWeeklyReport } from './workers/automation';

const QUEUE = 'careeros-scheduled';
const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

const TASKS: Record<string, () => Promise<unknown>> = {
  reminders: () => runReminders(),
  'job-fetch': () => runJobFetch(),
  cleanup: () => runCleanup(),
  'search-alerts': () => runSearchAlerts(),
  'daily-summary': () => runDailySummary(),
  'weekly-report': () => runWeeklyReport(),
  'resume-nudges': () => runResumeNudges(),
};

// A failed run is retried with exponential backoff (1, 2, 4 minutes); tasks are idempotent per run
const RETRY = { attempts: 4, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 100, removeOnFail: 200 };

async function main() {
  initSentry();
  await connectDatabase();

  const queue = new Queue(QUEUE, { connection });
  // Times are in the server's timezone setting below (India by default)
  const tz = env.SCHEDULER_TZ;
  await queue.upsertJobScheduler('reminders', { pattern: '0 9 * * *', tz }, { name: 'reminders', opts: RETRY });
  await queue.upsertJobScheduler('job-fetch', { every: 6 * 60 * 60 * 1000 }, { name: 'job-fetch', opts: RETRY });
  await queue.upsertJobScheduler('search-alerts', { pattern: '15 */2 * * *', tz }, { name: 'search-alerts', opts: RETRY });
  await queue.upsertJobScheduler('daily-summary', { pattern: '30 8 * * *', tz }, { name: 'daily-summary', opts: RETRY });
  await queue.upsertJobScheduler('weekly-report', { pattern: '0 9 * * 1', tz }, { name: 'weekly-report', opts: RETRY });
  await queue.upsertJobScheduler('resume-nudges', { pattern: '0 11 * * 3', tz }, { name: 'resume-nudges', opts: RETRY });
  await queue.upsertJobScheduler('cleanup', { pattern: '30 3 * * *', tz }, { name: 'cleanup', opts: RETRY });

  const worker = new Worker(
    QUEUE,
    async job => {
      const task = TASKS[job.name];
      if (!task) throw new Error(`Unknown task ${job.name}`);
      return task();
    },
    { connection, concurrency: 1 },
  );

  worker.on('completed', job => logger.info({ task: job.name }, 'Task completed'));
  worker.on('failed', (job, err) => {
    logger.error({ task: job?.name, attempt: job?.attemptsMade, err: err.message }, 'Task failed');
    captureError(err, { task: job?.name });
  });
  logger.info({ tasks: Object.keys(TASKS) }, '🛠️  CareerOS worker started');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, stopping worker...`);
    await worker.close();
    await queue.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(err => {
  logger.fatal(err, 'Worker failed to start');
  process.exit(1);
});
