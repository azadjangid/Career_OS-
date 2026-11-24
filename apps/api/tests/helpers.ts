import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { outbox } from '../src/lib/mailer';

export { app, prisma, outbox };

/** Empties every table (keeps the migrations table) so each test file starts clean. */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  outbox.length = 0;
}

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  /** Raw Set-Cookie value of the refresh cookie */
  refreshCookie: string;
  auth: { Authorization: string };
}

export async function registerUser(overrides: Partial<{ email: string; name: string; password: string }> = {}): Promise<TestUser> {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? 'Str0ngPassword';
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, name: overrides.name ?? `Test User ${counter}` })
    .expect(201);
  return {
    id: res.body.data.user.id,
    email,
    password,
    token: res.body.data.accessToken,
    refreshCookie: refreshCookieFrom(res.headers['set-cookie']),
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
  };
}

export function refreshCookieFrom(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const c = list.find(x => x.startsWith('refreshToken=') && !x.startsWith('refreshToken=;'));
  if (!c) throw new Error('No refresh cookie in response');
  return c.split(';')[0]!;
}

/** Pulls the token out of the newest emailed link like ".../reset-password?token=abc". */
export function tokenFromLastMail(pathPart: string): string {
  const mail = [...outbox].reverse().find(m => m.text.includes(pathPart));
  if (!mail) throw new Error(`No email containing ${pathPart}`);
  const m = new RegExp(`${pathPart}\\?token=([a-f0-9]+)`).exec(mail.text);
  if (!m) throw new Error('No token in email');
  return m[1]!;
}

/** A tiny but genuine PDF. */
export const SAMPLE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/** Creates a job + application for a user directly in the database. */
export async function createApplication(userId: string, title = 'Frontend Developer', companyName = 'Acme') {
  const job = await prisma.job.create({ data: { userId, title, companyName, description: 'Build UI with React', skills: ['React'] } });
  return prisma.application.create({ data: { userId, jobId: job.id, status: 'APPLIED' }, include: { job: true } });
}
