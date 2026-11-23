import { Queue } from 'bullmq';
import { getConnectionOptions } from './redis';

export async function scheduleRecurringJobs() {
  const jobFetchQueue = new Queue('job-fetch', getConnectionOptions());
  const remindersQueue = new Queue('reminders', getConnectionOptions());

  // Fetch new jobs every 6 hours
  await jobFetchQueue.upsertJobScheduler(
    'fetch-jobs-recurring',
    { every: 6 * 60 * 60 * 1000 },
    { name: 'fetch-all-sources', data: { sources: ['naukri', 'linkedin', 'indeed'] } }
  );

  // Send reminders every morning at 9am
  await remindersQueue.upsertJobScheduler(
    'daily-reminders',
    { pattern: '0 9 * * *' },
    { name: 'send-daily-reminders', data: {} }
  );

  await jobFetchQueue.close();
  await remindersQueue.close();
}
