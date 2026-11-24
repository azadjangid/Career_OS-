import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, createApplication, prisma, registerUser, resetDb, TestUser } from './helpers';
import { aiService } from '../src/services/ai.service';

let u: TestUser;
let appId: string;
let interviewId: string;

beforeAll(async () => {
  await resetDb();
  u = await registerUser({ name: 'Riya Sharma' });
  appId = (await createApplication(u.id, 'Frontend Developer', 'Razorpay')).id;
});

afterEach(() => vi.restoreAllMocks());

describe('interviews', () => {
  it('validates and schedules an interview', async () => {
    await request(app).post(`/api/applications/${appId}/interviews`).set(u.auth).send({ type: 'NOT_A_TYPE' }).expect(422);
    const res = await request(app)
      .post(`/api/applications/${appId}/interviews`)
      .set(u.auth)
      .send({ type: 'TECHNICAL', scheduledAt: '2030-01-15T10:30:00.000Z', durationMinutes: 45, meetingUrl: 'https://meet.example.com/abc', interviewer: 'Asha, EM' })
      .expect(201);
    interviewId = res.body.data.id;
    const list = await request(app).get('/api/interviews').set(u.auth).expect(200);
    expect(list.body.data.map((i: { id: string }) => i.id)).toContain(interviewId);
  });

  it('exports a valid calendar file', async () => {
    const res = await request(app).get(`/api/interviews/${interviewId}/calendar.ics`).set(u.auth).expect(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    const ics = res.text;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20300115T103000Z');
    expect(ics).toContain('DTEND:20300115T111500Z');
    expect(ics).toContain('SUMMARY:Interview: Frontend Developer at Razorpay');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75)).toBe(true);

    const all = await request(app).get('/api/interviews/calendar.ics').set(u.auth).expect(200);
    expect(all.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('marks an interview completed', async () => {
    const res = await request(app).put(`/api/interviews/${interviewId}`).set(u.auth).send({ status: 'COMPLETED', rating: 4 }).expect(200);
    expect(res.body.data.completedAt).toBeTruthy();
  });
});

describe('interview practice', () => {
  it('generates questions and grades an answer', async () => {
    const gen = vi.spyOn(aiService, 'generatePracticeQuestions').mockResolvedValue([
      { question: 'Tell me about a hard bug you fixed.', category: 'behavioral', difficulty: 'medium' },
      { question: 'How does React reconcile lists?', category: 'react', difficulty: 'hard' },
    ]);
    const res = await request(app).post(`/api/interviews/${interviewId}/practice`).set(u.auth).send({ count: 2 }).expect(201);
    expect(res.body.data).toHaveLength(2);
    expect(gen.mock.calls[0]![0]).toMatchObject({ jobTitle: 'Frontend Developer', company: 'Razorpay', interviewType: 'technical', count: 2 });

    const q = res.body.data[0];
    await request(app).post(`/api/interviews/${interviewId}/practice/${q.id}/answer`).set(u.auth).send({ answer: 'short' }).expect(422);

    vi.spyOn(aiService, 'gradePracticeAnswer').mockResolvedValue({
      score: 7, summary: 'Good structure', strengths: ['Clear result'], improvements: ['Quantify impact'], sampleAnswer: 'In my last role...',
    });
    const graded = await request(app)
      .post(`/api/interviews/${interviewId}/practice/${q.id}/answer`)
      .set(u.auth)
      .send({ answer: 'I found a race condition in our checkout and fixed it by...' })
      .expect(200);
    expect(graded.body.data.score).toBe(7);
    expect(graded.body.data.aiFeedback.improvements).toEqual(['Quantify impact']);
  });

  it('explains when AI is not configured', async () => {
    const res = await request(app).post(`/api/interviews/${interviewId}/practice`).set(u.auth).send({ count: 1 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

describe('recruiter messages', () => {
  it('drafts, edits and marks a message as sent', async () => {
    const spy = vi.spyOn(aiService, 'draftRecruiterMessage').mockResolvedValue({ subject: 'Frontend role at Razorpay', content: 'Hi Priya, ... Riya' });
    await request(app).post('/api/recruiter-messages/draft').set(u.auth).send({ kind: 'email' }).expect(422);
    const res = await request(app)
      .post('/api/recruiter-messages/draft')
      .set(u.auth)
      .send({ kind: 'email', applicationId: appId, recipientName: 'Priya' })
      .expect(201);
    expect(spy.mock.calls[0]![0]).toMatchObject({ kind: 'email', company: 'Razorpay', role: 'Frontend Developer', senderName: 'Riya Sharma' });
    expect(res.body.data).toMatchObject({ applicationId: appId, subject: 'Frontend role at Razorpay', type: 'email' });

    const id = res.body.data.id;
    const sent = await request(app).put(`/api/recruiter-messages/${id}`).set(u.auth).send({ content: 'Edited', sent: true }).expect(200);
    expect(sent.body.data.content).toBe('Edited');
    expect(sent.body.data.sentAt).toBeTruthy();

    const list = await request(app).get('/api/recruiter-messages').query({ applicationId: appId }).set(u.auth).expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('keeps LinkedIn notes within 300 characters', async () => {
    // exercise the real trimming logic with a fake model response
    vi.spyOn(aiService, 'complete').mockResolvedValue(JSON.stringify({ subject: 'x', content: 'a'.repeat(400) }));
    const draft = await aiService.draftRecruiterMessage(
      { kind: 'linkedin', company: 'A', role: 'B', senderName: 'C', resumeText: '', jobDescription: '' },
      u.id,
    );
    expect(draft.content.length).toBeLessThanOrEqual(300);
    expect(draft.subject).toBeNull();
    expect(await prisma.aIUsage.count({ where: { userId: u.id } })).toBe(0);
  });
});
