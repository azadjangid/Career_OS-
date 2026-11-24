/**
 * Runs before every test file, before the app is imported, so config/env.ts sees these values.
 * Integration tests need a real Postgres: set TEST_DATABASE_URL (CI does), or create the default
 * database below with `createdb careeros_test` and run `npm run db:migrate:prod` against it.
 */
import os from 'os';
import path from 'path';

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? 'postgresql://careeros:password@localhost:5432/careeros_test';
process.env['JWT_SECRET'] = 'test-access-secret-that-is-at-least-32-chars';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-chars';
process.env['BCRYPT_ROUNDS'] = '4';
process.env['STORAGE_PROVIDER'] = 'local';
process.env['STORAGE_LOCAL_PATH'] = path.join(os.tmpdir(), `careeros-test-uploads-${process.pid}`);
process.env['FRONTEND_URL'] = 'http://app.test';
process.env['LOG_LEVEL'] = 'silent';
process.env['LOG_FORMAT'] = 'json';
process.env['AI_PROVIDER'] = 'anthropic';
// SMTP left unset: mail lands in the in-memory outbox that tests read
delete process.env['SMTP_HOST'];
delete process.env['ANTHROPIC_API_KEY'];
delete process.env['AI_API_KEY'];
delete process.env['SENTRY_DSN'];
