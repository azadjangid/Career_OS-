import { Worker, Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '../prisma';
import { getConnectionOptions } from '../redis';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface JobFetchPayload {
  sources?: string[];
  query?: string;
  location?: string;
}

export const jobFetchWorker = new Worker<JobFetchPayload>(
  'job-fetch',
  async (job: Job<JobFetchPayload>) => {
    logger.info({ jobId: job.id, data: job.data }, 'Fetching jobs');

    // In production this would call real job board APIs
    // For now we log that the worker is running
    const sources = job.data.sources || ['demo'];

    for (const source of sources) {
      logger.info({ source }, 'Fetching from source');

      // Placeholder: in production, integrate with:
      // - Naukri API
      // - LinkedIn Jobs API
      // - Indeed API
      // - RemoteOK API
      // Each would parse results and upsert into the jobs table
    }

    // Example: mark all fetched jobs as processed
    await prisma.job.updateMany({
      where: { source: 'seed', isActive: true },
      data: { isActive: true }, // No-op, just showing the pattern
    });

    return { fetched: 0, sources };
  },
  {
    ...getConnectionOptions(),
    concurrency: 1,
    limiter: { max: 5, duration: 60000 }, // 5 jobs per minute
  }
);
