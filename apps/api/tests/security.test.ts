import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, prisma, registerUser, resetDb, TestUser } from './helpers';

let a: TestUser;
let b: TestUser;
let bProfileId: string;

beforeAll(async () => {
  await resetDb();
  a = await registerUser();
  b = await registerUser();
  await request(app).put('/api/users/profile').set(a.auth).send({ headline: 'A' }).expect(200);
  bProfileId = (await request(app).put('/api/users/profile').set(b.auth).send({ headline: 'B' }).expect(200)).body.data.id;
});

describe('profile sub-resources cannot be moved into another user', () => {
  it('rejects profileId and unknown fields on skill/experience/education/project updates', async () => {
    const skill = (await request(app).post('/api/users/profile/skills').set(a.auth).send({ name: 'React' }).expect(201)).body.data;
    await request(app).put(`/api/users/profile/skills/${skill.id}`).set(a.auth).send({ profileId: bProfileId }).expect(422);
    expect((await prisma.skill.findUnique({ where: { id: skill.id } }))!.profileId).not.toBe(bProfileId);

    const exp = (await request(app).post('/api/users/profile/experience').set(a.auth).send({ title: 'Dev', company: 'X', startDate: '2022-01-01' }).expect(201)).body.data;
    await request(app).put(`/api/users/profile/experience/${exp.id}`).set(a.auth).send({ profileId: bProfileId }).expect(422);
    await request(app).put(`/api/users/profile/experience/${exp.id}`).set(a.auth).send({ startDate: 'not a date' }).expect(422);
    await request(app).put(`/api/users/profile/experience/${exp.id}`).set(a.auth).send({ title: 'Senior Dev' }).expect(200);
    // Another user can't edit it
    await request(app).put(`/api/users/profile/experience/${exp.id}`).set(b.auth).send({ title: 'Hacked' }).expect(404);
    expect((await prisma.experience.findUnique({ where: { id: exp.id } }))!.title).toBe('Senior Dev');
  });

  it('only accepts known preference fields', async () => {
    await request(app).put('/api/users/preferences').set(a.auth).send({ userId: b.id }).expect(422);
    await request(app).put('/api/users/preferences').set(a.auth).send({ extras: { lastJobFetchAt: '2000-01-01' } }).expect(422);
    const ok = await request(app).put('/api/users/preferences').set(a.auth).send({ theme: 'light' }).expect(200);
    expect(ok.body.data.userId).toBe(a.id);
  });
});

describe('request hardening', () => {
  it('bounds notification paging and survives bad numbers', async () => {
    const res = await request(app).get('/api/notifications?page=abc&limit=999999').set(a.auth).expect(200);
    expect(res.body.data.notifications).toEqual([]);
  });

  it('returns a request id on every response', async () => {
    const res = await request(app).get('/api/health/live').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,}$/);
  });
});
