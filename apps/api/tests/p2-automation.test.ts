import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createApplication, outbox, prisma, registerUser, resetDb, TestUser } from './helpers';
import { runDailySummary, runResumeNudges, runSearchAlerts, runWeeklyReport } from '../src/workers/automation';
import { runReminders } from '../src/workers/tasks';

const DAY = 86_400_000;
let u: TestUser;

async function setPrefs(userId: string, data: Record<string, unknown>) {
  await prisma.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

beforeEach(async () => {
  await resetDb();
  u = await registerUser({ name: 'Auto User' });
  await prisma.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  await setPrefs(u.id, {});
});

describe('saved-search alerts', () => {
  it('notifies once about jobs added after the last run, and respects pause', async () => {
    const created = await request(app).post('/api/jobs/searches').set(u.auth).send({ name: 'React', filters: { q: 'react' }, alertEnabled: true }).expect(201);
    // A job from before the search existed doesn't count
    await prisma.job.create({ data: { userId: u.id, title: 'Old React role', companyName: 'Old', createdAt: new Date(Date.now() - DAY) } });
    await prisma.job.create({ data: { userId: u.id, title: 'React Engineer', companyName: 'Acme' } });
    await prisma.job.create({ data: { userId: u.id, title: 'Java Engineer', companyName: 'Beta' } });

    const r1 = await runSearchAlerts();
    expect(r1).toEqual({ searches: 1, notified: 1 });
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: u.id, type: 'JOB_MATCH' } });
    expect(n.title).toBe('1 new job for “React”');
    expect(n.body).toBe('React Engineer at Acme');
    expect(outbox.some(m => m.to === u.email && m.subject.startsWith('1 new job for “React”'))).toBe(true);
    expect((await prisma.jobSearch.findUniqueOrThrow({ where: { id: created.body.data.id } })).lastNotifiedAt).not.toBeNull();

    // Nothing new: no second notification
    expect((await runSearchAlerts()).notified).toBe(0);

    await setPrefs(u.id, { automationPaused: true });
    await prisma.job.create({ data: { userId: u.id, title: 'React Lead', companyName: 'Gamma' } });
    expect(await runSearchAlerts()).toEqual({ searches: 0, notified: 0 });
    expect(await prisma.notification.count({ where: { userId: u.id, type: 'JOB_MATCH' } })).toBe(1);
  });
});

describe('daily summary', () => {
  it('summarises new jobs, strong matches and follow-ups once per day', async () => {
    await request(app).post('/api/users/profile/skills').set(u.auth).send({ name: 'React' }).expect(201);
    await request(app).post('/api/users/profile/skills').set(u.auth).send({ name: 'TypeScript' }).expect(201);
    await request(app).post('/api/users/profile/skills').set(u.auth).send({ name: 'CSS' }).expect(201);
    await prisma.job.create({ data: { userId: u.id, title: 'Frontend Dev', companyName: 'Acme', skills: ['React', 'TypeScript', 'CSS'] } });
    const app1 = await createApplication(u.id, 'UI Engineer', 'Beta');
    await prisma.application.update({ where: { id: app1.id }, data: { followUpAt: new Date() } });

    const r = await runDailySummary();
    expect(r.sent).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: u.id, type: 'SYSTEM' } });
    expect(n.title).toBe('Your daily job summary');
    expect(n.body).toContain('2 new jobs added');
    expect(n.body).toContain('1 strong match (70%+): Frontend Dev at Acme (100%)');
    expect(n.body).toContain('1 follow-up due');
    // Email copy is off by default
    expect(outbox.some(m => m.subject.startsWith('Your daily job summary'))).toBe(false);

    expect((await runDailySummary()).sent).toBe(0);
  });

  it('can be turned off, and sends nothing when there is nothing to say', async () => {
    expect((await runDailySummary()).sent).toBe(0);
    await prisma.job.create({ data: { userId: u.id, title: 'Dev', companyName: 'X' } });
    await setPrefs(u.id, { dailySummary: false });
    expect(await runDailySummary()).toEqual({ users: 0, sent: 0 });
  });
});

describe('weekly report', () => {
  it('compares the last 7 days with the week before and emails when asked', async () => {
    await setPrefs(u.id, { emailWeeklySummary: true });
    for (const t of ['A', 'B']) {
      const a = await createApplication(u.id, t, `${t} Co`);
      await prisma.application.update({ where: { id: a.id }, data: { appliedAt: new Date(Date.now() - 2 * DAY) } });
    }
    const old = await createApplication(u.id, 'C', 'C Co');
    await prisma.application.update({ where: { id: old.id }, data: { appliedAt: new Date(Date.now() - 10 * DAY) } });
    await prisma.applicationStatusHistory.create({ data: { applicationId: old.id, fromStatus: 'APPLIED', toStatus: 'INTERVIEW' } });

    expect((await runWeeklyReport()).sent).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: u.id, type: 'AI_INSIGHT' } });
    expect(n.body).toContain('2 applications sent (up from 1)');
    expect(n.body).toContain('1 employer reply');
    expect(n.body).toContain('1 moved to interview');
    expect(n.body).toContain('3 to go');
    expect(outbox.some(m => m.subject.startsWith('Your weekly progress report'))).toBe(true);
    expect((await runWeeklyReport()).sent).toBe(0);
  });
});

describe('resume nudges', () => {
  it('nudges about a low ATS score at most every 14 days, and not for brand-new users', async () => {
    await prisma.resume.create({ data: { userId: u.id, name: 'CV', atsScore: 42, isDefault: true } });
    expect((await runResumeNudges()).sent).toBe(0); // account is less than 3 days old
    await prisma.user.update({ where: { id: u.id }, data: { createdAt: new Date(Date.now() - 10 * DAY) } });
    expect((await runResumeNudges()).sent).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: u.id, type: 'AI_INSIGHT' } });
    expect(n.title).toBe('Your resume scores 42/100 on the ATS check');
    expect((await runResumeNudges()).sent).toBe(0);
  });
});

describe('automation settings', () => {
  it('validates the switches and pausing also stops reminders', async () => {
    await request(app).put('/api/users/settings').set(u.auth).send({ automationPaused: 'yes' }).expect(400);
    await request(app).put('/api/users/settings').set(u.auth).send({ jobAlertMinMatchScore: 500 }).expect(400);
    await request(app).put('/api/users/settings').set(u.auth).send({ automationPaused: true, emailDailySummary: true }).expect(200);
    const s = (await request(app).get('/api/users/settings').set(u.auth).expect(200)).body.data;
    expect(s).toMatchObject({ automationPaused: true, emailDailySummary: true, dailySummary: true });

    const a = await createApplication(u.id, 'SDE', 'Acme');
    await prisma.application.update({ where: { id: a.id }, data: { followUpAt: new Date() } });
    const r = await runReminders();
    expect(r.notifications).toBe(0);
  });
});
