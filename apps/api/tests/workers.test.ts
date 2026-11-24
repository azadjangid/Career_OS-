import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApplication, outbox, prisma, registerUser, resetDb, TestUser } from './helpers';
import { runCleanup, runJobFetch, runReminders } from '../src/workers/tasks';
import { importJobsForUser } from '../src/lib/jobImport';

let verified: TestUser;
let unverified: TestUser;

beforeAll(async () => {
  await resetDb();
  verified = await registerUser({ name: 'Verified Person' });
  unverified = await registerUser({ name: 'Unverified Person' });
  await prisma.user.update({ where: { id: verified.id }, data: { emailVerified: true } });
});

afterEach(() => vi.unstubAllGlobals());

describe('daily reminders', () => {
  it('notifies about interviews in the next 24h and due follow-ups, once', async () => {
    const a = await createApplication(verified.id, 'SDE 1', 'Zerodha');
    await prisma.interview.create({ data: { userId: verified.id, applicationId: a.id, jobId: a.jobId, type: 'HR', scheduledAt: new Date(Date.now() + 3 * 3_600_000) } });
    // too far away: no reminder
    await prisma.interview.create({ data: { userId: verified.id, applicationId: a.id, jobId: a.jobId, type: 'FINAL', scheduledAt: new Date(Date.now() + 5 * 86_400_000) } });
    const b = await createApplication(verified.id, 'UI Engineer', 'Swiggy');
    await prisma.application.update({ where: { id: b.id }, data: { followUpAt: new Date(Date.now() - 3_600_000) } });
    // closed applications are skipped
    const c = await createApplication(verified.id, 'Old role', 'Closed Co');
    await prisma.application.update({ where: { id: c.id }, data: { status: 'REJECTED', followUpAt: new Date() } });

    const u2 = await createApplication(unverified.id, 'Designer', 'Figma');
    await prisma.application.update({ where: { id: u2.id }, data: { followUpAt: new Date() } });

    outbox.length = 0;
    const first = await runReminders();
    expect(first.notifications).toBe(3);
    const types = (await prisma.notification.findMany({ where: { userId: verified.id } })).map(n => n.type).sort();
    expect(types).toEqual(['FOLLOW_UP_DUE', 'INTERVIEW_REMINDER']);

    // email only to the confirmed address
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe(verified.email);
    expect(outbox[0]!.text).toContain('SDE 1 at Zerodha');
    expect(outbox[0]!.text).toContain('UI Engineer at Swiggy');
    expect(outbox[0]!.text).not.toContain('Closed Co');

    const second = await runReminders();
    expect(second.notifications).toBe(0);
    expect(outbox).toHaveLength(1);
  });

  it('respects the email preference', async () => {
    await prisma.notification.deleteMany({});
    await prisma.userPreference.upsert({ where: { userId: verified.id }, create: { userId: verified.id, emailInterviewReminders: false }, update: { emailInterviewReminders: false } });
    outbox.length = 0;
    const r = await runReminders();
    expect(r.notifications).toBeGreaterThan(0);
    expect(outbox).toHaveLength(0);
  });
});

describe('job import', () => {
  const remotiveFixture = {
    jobs: [
      { id: 1, url: 'https://remotive.com/1', title: 'React Developer', company_name: 'Acme', tags: ['react'], job_type: 'full_time', publication_date: '2026-11-01T00:00:00', candidate_required_location: 'India', description: '<p>Build <b>things</b></p>' },
      { id: 2, url: 'https://remotive.com/2', title: 'Node Engineer', company_name: 'Beta', job_type: 'contract' },
    ],
  };

  it('imports from a source and skips jobs it already has', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(remotiveFixture), { status: 200 })));
    const first = await importJobsForUser(verified.id, { sources: ['remotive'], greenhouse: [], lever: [] }, 'react');
    expect(first).toMatchObject({ fetched: 2, created: 2 });
    const job = await prisma.job.findFirstOrThrow({ where: { userId: verified.id, externalId: 'remotive:1' } });
    expect(job.description).toBe('Build things');
    expect(job.jobType).toBe('FULL_TIME');

    const second = await importJobsForUser(verified.id, { sources: ['remotive'], greenhouse: [], lever: [] });
    expect(second.created).toBe(0);
  });

  it('reports a failing source without failing the others', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) =>
      String(url).includes('remoteok') ? new Response('nope', { status: 503 }) : new Response(JSON.stringify({ data: [] }), { status: 200 })));
    const r = await importJobsForUser(verified.id, { sources: ['remoteok', 'arbeitnow'], greenhouse: [], lever: [] });
    expect(r.bySource.find(s => s.source === 'remoteok')?.error).toMatch(/503/);
    expect(r.bySource.find(s => s.source === 'arbeitnow')?.error).toBeUndefined();
  });

  it('runs scheduled fetches only for users who turned it on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ jobs: [{ id: 99, url: 'https://remotive.com/99', title: 'New role', company_name: 'Gamma' }] }), { status: 200 })));
    await prisma.userPreference.update({ where: { userId: verified.id }, data: { extras: { autoFetchJobs: true, jobSources: ['remotive'] } } });
    const r = await runJobFetch();
    expect(r).toEqual({ users: 1, created: 1 });
    const n = await prisma.notification.findFirst({ where: { userId: verified.id, type: 'JOB_MATCH' } });
    expect(n?.title).toBe('1 new job imported');
  });
});

describe('cleanup', () => {
  it('removes expired tokens and links', async () => {
    const past = new Date(Date.now() - 1000);
    await prisma.refreshToken.create({ data: { userId: verified.id, token: 'expired-hash', expiresAt: past } });
    await prisma.emailVerification.create({ data: { userId: verified.id, tokenHash: 'expired-verify', expiresAt: past } });
    const r = await runCleanup();
    expect(r.refreshTokens).toBeGreaterThanOrEqual(1);
    expect(r.emailVerifications).toBeGreaterThanOrEqual(1);
    expect(await prisma.refreshToken.count({ where: { token: 'expired-hash' } })).toBe(0);
  });
});
