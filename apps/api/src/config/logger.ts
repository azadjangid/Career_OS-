import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';
const logFormat = process.env['LOG_FORMAT'] ?? 'pretty';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: isDev && logFormat === 'pretty'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});
