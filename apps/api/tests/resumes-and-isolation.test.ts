import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { app, createApplication, prisma, registerUser, resetDb, SAMPLE_PDF, TestUser } from './helpers';
import { env } from '../src/config/env';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  await resetDb();
  alice = await registerUser({ name: 'Alice' });
  bob = await registerUser({ name: 'Bob' });
});

const upload = (u: TestUser, buf: Buffer, filename: string) =>
  request(app).post('/api/resumes').set(u.auth).attach('file', buf, filename);

describe('resume uploads', () => {
  it('accepts a real PDF and stores it privately', async () => {
    const res = await upload(alice, SAMPLE_PDF, 'cv.pdf').expect(201);
    expect(res.body.data.fileUrl).toBeNull();
    const row = await prisma.resume.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.storageKey).toMatch(new RegExp(`^resumes/${alice.id}/[a-f0-9]{32}\\.pdf$`));
    await expect(fs.stat(path.resolve(env.STORAGE_LOCAL_PATH, row.storageKey!))).resolves.toBeTruthy();
  });

  it('rejects a file whose content is not what its name says', async () => {
    const res = await upload(alice, Buffer.from('MZ this is really an exe'), 'resume.pdf').expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE');
    await upload(alice, Buffer.from('plain text'), 'resume.docx').expect(415);
  });

  it('rejects unsupported extensions such as .doc and .exe', async () => {
    await upload(alice, SAMPLE_PDF, 'resume.doc').expect(415);
    await upload(alice, SAMPLE_PDF, 'resume.exe').expect(415);
  });

  it('no longer serves files from a public /uploads URL', async () => {
    const row = await prisma.resume.findFirstOrThrow({ where: { userId: alice.id } });
    await request(app).get(`/uploads/${row.storageKey}`).expect(404);
  });

  it('lets only the owner download the original file', async () => {
    const row = await prisma.resume.findFirstOrThrow({ where: { userId: alice.id } });
    const own = await request(app).get(`/api/resumes/${row.id}/file`).set(alice.auth).buffer(true).expect(200);
    expect(own.headers['content-disposition']).toContain('attachment');
    expect(own.headers['content-type']).toContain('application/pdf');
    expect(Buffer.compare(own.body as Buffer, SAMPLE_PDF)).toBe(0);

    await request(app).get(`/api/resumes/${row.id}/file`).set(bob.auth).expect(404);
    await request(app).get(`/api/resumes/${row.id}/file`).expect(401);
  });

  it('keeps the file while a duplicate still uses it, and removes it with the last one', async () => {
    const res = await upload(alice, SAMPLE_PDF, 'shared.pdf').expect(201);
    const original = await prisma.resume.findUniqueOrThrow({ where: { id: res.body.data.id } });
    const file = path.resolve(env.STORAGE_LOCAL_PATH, original.storageKey!);
    const dup = await request(app).post(`/api/resumes/${original.id}/duplicate`).set(alice.auth).send({}).expect(201);

    await request(app).delete(`/api/resumes/${original.id}`).set(alice.auth).expect(200);
    await expect(fs.stat(file)).resolves.toBeTruthy();
    await request(app).get(`/api/resumes/${dup.body.data.id}/file`).set(alice.auth).expect(200);

    await request(app).delete(`/api/resumes/${dup.body.data.id}`).set(alice.auth).expect(200);
    await expect(fs.stat(file)).rejects.toThrow();
  });
});

describe("users can't touch each other's data", () => {
  it('applications', async () => {
    const app1 = await createApplication(alice.id);
    await request(app).get(`/api/applications/${app1.id}`).set(bob.auth).expect(404);
    await request(app).put(`/api/applications/${app1.id}`).set(bob.auth).send({ status: 'OFFER' }).expect(404);
    await request(app).delete(`/api/applications/${app1.id}`).set(bob.auth).expect(404);
    await request(app).post(`/api/applications/${app1.id}/interviews`).set(bob.auth).send({ type: 'HR' }).expect(404);
    const list = await request(app).get('/api/applications').set(bob.auth).expect(200);
    expect(list.body.data.applications).toHaveLength(0);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app1.id } })).status).toBe('APPLIED');
  });

  it('resumes', async () => {
    const r = await prisma.resume.findFirstOrThrow({ where: { userId: alice.id } });
    await request(app).get(`/api/resumes/${r.id}`).set(bob.auth).expect(404);
    await request(app).get(`/api/resumes/${r.id}/preview`).set(bob.auth).expect(404);
    await request(app).delete(`/api/resumes/${r.id}`).set(bob.auth).expect(404);
    const list = await request(app).get('/api/resumes').set(bob.auth).expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('interviews and recruiter messages', async () => {
    const a = await createApplication(alice.id, 'Backend Engineer', 'Globex');
    const iv = await request(app).post(`/api/applications/${a.id}/interviews`).set(alice.auth).send({ type: 'HR', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(201);
    await request(app).get(`/api/interviews/${iv.body.data.id}`).set(bob.auth).expect(404);
    await request(app).get(`/api/interviews/${iv.body.data.id}/calendar.ics`).set(bob.auth).expect(404);
    await request(app).delete(`/api/interviews/${iv.body.data.id}`).set(bob.auth).expect(404);
    const msg = await prisma.recruiterMessage.create({ data: { userId: alice.id, content: 'Hi', type: 'email' } });
    await request(app).put(`/api/recruiter-messages/${msg.id}`).set(bob.auth).send({ content: 'hacked' }).expect(404);
    await request(app).delete(`/api/recruiter-messages/${msg.id}`).set(bob.auth).expect(200);
    expect(await prisma.recruiterMessage.count({ where: { id: msg.id } })).toBe(1);
  });
});

describe('data export and account deletion', () => {
  it('exports everything without secrets', async () => {
    const res = await request(app).get('/api/users/export').set(alice.auth).expect(200);
    const text = JSON.stringify(res.body);
    expect(res.body.user.email).toBe(alice.email);
    expect(res.body.applications.length).toBeGreaterThan(0);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('apiKeyHash');
  });

  it('deletes the account and its stored files', async () => {
    const res = await upload(bob, SAMPLE_PDF, 'bob.pdf').expect(201);
    const row = await prisma.resume.findUniqueOrThrow({ where: { id: res.body.data.id } });
    const file = path.resolve(env.STORAGE_LOCAL_PATH, row.storageKey!);
    await request(app).delete('/api/users/account').set(bob.auth).expect(200);
    await expect(fs.stat(file)).rejects.toThrow();
    expect(await prisma.user.count({ where: { id: bob.id } })).toBe(0);
  });
});
