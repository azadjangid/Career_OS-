import * as Sentry from '@sentry/node';
import { env } from '../config/env';

let enabled = false;

/** Turns on error reporting when SENTRY_DSN is set. Safe to call more than once. */
export function initSentry(): void {
  if (enabled || !env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Never send request bodies, cookies or headers: they can hold passwords, tokens and resumes
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
  enabled = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
