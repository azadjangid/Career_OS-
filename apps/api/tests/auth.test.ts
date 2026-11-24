import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, outbox, prisma, refreshCookieFrom, registerUser, resetDb, tokenFromLastMail } from './helpers';
import { hashToken } from '../src/modules/auth/auth.service';

beforeAll(resetDb);

describe('health', () => {
  it('reports the database as ok', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.data.checks.database).toBe('ok');
    await request(app).get('/api/health/live').expect(200);
  });

  it('sends strict security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('register and login', () => {
  it('registers, sets an httpOnly refresh cookie scoped to /api/auth, and emails a confirmation link', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'New.Person@Example.com', password: 'Str0ngPassword', name: 'New Person' })
      .expect(201);
    expect(res.body.data.user.email).toBe('new.person@example.com');
    expect(res.body.data.user.emailVerified).toBe(false);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith('refreshToken='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(outbox.at(-1)?.to).toBe('new.person@example.com');
    expect(outbox.at(-1)?.text).toContain('http://app.test/verify-email?token=');
  });

  it('rejects weak passwords and duplicate emails', async () => {
    await request(app).post('/api/auth/register').send({ email: 'weak@example.com', password: 'short', name: 'Weak' }).expect(422);
    await request(app).post('/api/auth/register').send({ email: 'new.person@example.com', password: 'Str0ngPassword', name: 'Dup' }).expect(409);
  });

  it('logs in with the right password only', async () => {
    await request(app).post('/api/auth/login').send({ email: 'new.person@example.com', password: 'WrongPass1' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'WrongPass1' }).expect(401);
    const ok = await request(app).post('/api/auth/login').send({ email: 'NEW.person@example.com', password: 'Str0ngPassword' }).expect(200);
    expect(ok.body.data.accessToken).toBeTruthy();
  });

  it('requires a bearer token and ignores an accessToken cookie', async () => {
    const u = await registerUser();
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', `accessToken=${u.token}`).expect(401);
    const me = await request(app).get('/api/auth/me').set(u.auth).expect(200);
    expect(me.body.data.email).toBe(u.email);
  });
});

describe('refresh tokens', () => {
  it('stores only hashes of refresh tokens', async () => {
    const u = await registerUser();
    const raw = u.refreshCookie.split('=')[1]!;
    const rows = await prisma.refreshToken.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token).toBe(hashToken(raw));
    expect(rows[0]!.token).not.toBe(raw);
  });

  it('rotates on refresh and revokes every session when an old token is reused', async () => {
    const u = await registerUser();
    // a second session for the same user
    const other = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password }).expect(200);
    const otherCookie = refreshCookieFrom(other.headers['set-cookie']);

    const first = await request(app).post('/api/auth/refresh').set('Cookie', u.refreshCookie).expect(200);
    const rotated = refreshCookieFrom(first.headers['set-cookie']);
    expect(rotated).not.toBe(u.refreshCookie);

    // replaying the old token looks like theft: it fails and ends all sessions
    await request(app).post('/api/auth/refresh').set('Cookie', u.refreshCookie).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', rotated).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', otherCookie).expect(401);
  });

  it('logs out with just the cookie (no access token needed)', async () => {
    const u = await registerUser();
    await request(app).post('/api/auth/logout').set('Cookie', u.refreshCookie).expect(200);
    expect(await prisma.refreshToken.count({ where: { userId: u.id } })).toBe(0);
    await request(app).post('/api/auth/refresh').set('Cookie', u.refreshCookie).expect(401);
  });
});

describe('password reset', () => {
  it('emails a link, never logs or stores the raw token, and resets the password once', async () => {
    const u = await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email: u.email }).expect(200);
    const token = tokenFromLastMail('/reset-password');
    const stored = await prisma.passwordReset.findFirst({ where: { userId: u.id } });
    expect(stored?.token).toBe(hashToken(token));

    await request(app).post('/api/auth/reset-password').send({ token, password: 'N3wPassword' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'An0therPass' }).expect(400);
    await request(app).post('/api/auth/login').send({ email: u.email, password: u.password }).expect(401);
    await request(app).post('/api/auth/login').send({ email: u.email, password: 'N3wPassword' }).expect(200);
    // old sessions are ended
    await request(app).post('/api/auth/refresh').set('Cookie', u.refreshCookie).expect(401);
  });

  it('answers the same for unknown emails', async () => {
    const before = outbox.length;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(200);
    expect(res.body.data.message).toMatch(/If that email exists/);
    expect(outbox.length).toBe(before);
  });
});

describe('email verification', () => {
  it('confirms the address with the emailed link and rejects reuse', async () => {
    const u = await registerUser();
    const token = tokenFromLastMail('/verify-email');
    await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
    const me = await request(app).get('/api/auth/me').set(u.auth).expect(200);
    expect(me.body.data.emailVerified).toBe(true);
    await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
    const again = await request(app).post('/api/auth/resend-verification').set(u.auth).expect(200);
    expect(again.body.data.alreadyVerified).toBe(true);
  });

  it('can resend a link while unverified', async () => {
    const u = await registerUser();
    const before = outbox.length;
    const res = await request(app).post('/api/auth/resend-verification').set(u.auth).expect(200);
    expect(res.body.data.sent).toBe(true);
    expect(outbox.length).toBe(before + 1);
  });
});

describe('account', () => {
  it('validates the new password on change and writes an audit entry', async () => {
    const u = await registerUser();
    await request(app).put('/api/users/account/password').set(u.auth).send({ currentPassword: u.password, newPassword: 'weak' }).expect(422);
    await request(app).put('/api/users/account/password').set(u.auth).send({ currentPassword: u.password, newPassword: 'Better1Password' }).expect(200);
    const actions = (await prisma.auditLog.findMany({ where: { userId: u.id } })).map(a => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.register', 'account.password_changed']));
  });
});
