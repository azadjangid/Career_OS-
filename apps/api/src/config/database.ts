import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from './logger';

type Client = PrismaClient<Prisma.PrismaClientOptions, 'error' | 'warn'>;
const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma: Client =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

prisma.$on('error', (e) => logger.error(e, 'Prisma error'));
prisma.$on('warn', (e) => logger.warn(e, 'Prisma warning'));

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error(error, 'Failed to connect to database');
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
