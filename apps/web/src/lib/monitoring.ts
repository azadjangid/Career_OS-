import * as Sentry from '@sentry/react';

const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;

/** Error reporting for the browser app. Does nothing unless VITE_SENTRY_DSN is set at build time. */
export function initMonitoring(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env['VITE_APP_VERSION'] as string | undefined) || undefined,
    // Errors only; no session replay or user data
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) delete event.request.headers;
      return event;
    },
  });
}

export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (!dsn) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
}
