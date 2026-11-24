/**
 * P1 features: job enrichment and duplicate detection, saved searches, resume versions with the
 * rule-based ATS score and compare view, the Assessment stage and recruiter fields, and the
 * command-center dashboard numbers against seeded data.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, prisma, registerUser, resetDb, SAMPLE_PDF, TestUser } from './helpers';
import { dedupeKey, detectExperienceLevel, detectIndiaEligible, extractSkills } from '../src/lib/jobEnrich';
import { scoreResume, topSkills } from '../src/lib/atsScore';
import { diffLines } from '../src/lib/textDiff';
import { importJobsForUser } from '../src/lib/jobImport';

const GOOD_RESUME = `Priya Sharma
priya.sharma@example.com | +91 98765 43210 | linkedin.com/in/priyasharma | github.com/priyas

SUMMARY
Frontend developer with 4 years of experience building React and TypeScript apps for fintech products.

EXPERIENCE
Senior Frontend Developer, Paywise, Bengaluru (Jan 2023 – Present)
- Built a React and TypeScript design system used by 6 product teams
- Reduced dashboard load time by 45% by code-splitting and caching with React Query
- Led the migration from Webpack to Vite, cutting build time from 4 minutes to 40 seconds
- Mentored 3 junior developers and introduced Jest and Playwright testing

Frontend Developer, ShopKart, Pune (Jun 2020 – Dec 2022)
- Developed checkout flows in Next.js serving 2M monthly users
- Improved accessibility to WCAG AA across 30 pages
- Automated releases with GitHub Actions CI/CD and Docker

PROJECTS
- Open-source React form library with 1,200 GitHub stars

SKILLS
JavaScript, TypeScript, React, Next.js, Redux, Node.js, GraphQL, Tailwind CSS, Jest, Playwright, Git, Docker, AWS

EDUCATION
B.Tech in Computer Science, VIT Vellore, 2016 – 2020
` + ' Worked on shipping features across many products and improving quality.'.repeat(12);

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  await resetDb();
  a = await registerUser({ name: 'Priya' });
  b = await registerUser({ name: 'Other' });
});
afterEach(() => vi.unstubAllGlobals());

describe('job enrichment (no AI)', () => {
  it('extracts skills without mistaking everyday words for languages', () => {
    const s = extractSkills('Senior React Developer', 'We use React, TypeScript and Node.js with PostgreSQL on AWS. You will go to the office twice a week and rest on weekends.');
    expect(s).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS']));
    expect(s).not.toContain('Go');
    expect(s).not.toContain('REST');
    expect(extractSkills('Backend engineer (Golang)')).toContain('Go');
  });

  it('reads seniority from the title first, then from years of experience', () => {
    expect(detectExperienceLevel('Junior Frontend Engineer')).toBe('ENTRY');
    expect(detectExperienceLevel('Sr. React Developer')).toBe('SENIOR');
    expect(detectExperienceLevel('Staff Engineer')).toBe('LEAD');
    expect(detectExperienceLevel('Frontend Engineer', 'You have 3+ years of experience')).toBe('MID');
    expect(detectExperienceLevel('Frontend Engineer')).toBeNull();
  });

  it('decides India eligibility only from what the posting says', () => {
    expect(detectIndiaEligible('Bengaluru, India', 'HYBRID')).toBe(true);
    expect(detectIndiaEligible('Worldwide', 'REMOTE')).toBe(true);
    expect(detectIndiaEligible('USA only', 'REMOTE')).toBe(false);
    expect(detectIndiaEligible('Berlin', 'ONSITE')).toBe(false);
    expect(detectIndiaEligible(null, 'REMOTE', 'We are hiring anywhere in the world, open to India.')).toBe(true);
    expect(detectIndiaEligible(null, 'REMOTE', 'A great team.')).toBeNull();
  });

  it('builds the same duplicate key for the same role at the same company', () => {
    expect(dedupeKey('Razorpay Software Pvt Ltd', 'Sr. Frontend Engineer (React)')).toBe(dedupeKey('Razorpay', 'Sr Frontend Engineer - React'));
    expect(dedupeKey('Razorpay', 'Backend Engineer')).not.toBe(dedupeKey('Razorpay', 'Frontend Engineer'));
  });

  it('imports enriched jobs and skips the same role arriving twice', async () => {
    const feed = {
      jobs: [
        { id: 501, url: 'https://remotive.com/501', title: 'Senior Frontend Engineer', company_name: 'Razorpay', tags: ['react'], job_type: 'full_time', candidate_required_location: 'Worldwide', description: 'Work with React and TypeScript.' },
        { id: 502, url: 'https://remotive.com/502', title: 'Senior Frontend Engineer', company_name: 'Razorpay Software Pvt Ltd', job_type: 'full_time', candidate_required_location: 'Worldwide' },
        { id: 503, url: 'https://remotive.com/503', title: 'Platform Engineer', company_name: 'Beta', job_type: 'full_time', candidate_required_location: 'USA only', description: 'Kubernetes, Terraform, 6+ years' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(feed), { status: 200 })));
    const r = await importJobsForUser(a.id, { sources: ['remotive'], greenhouse: [], lever: [] });
    expect(r).toMatchObject({ fetched: 3, created: 2, duplicates: 1 });

    const fe = await prisma.job.findFirstOrThrow({ where: { userId: a.id, externalId: 'remotive:501' } });
    expect(fe.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']));
    expect(fe).toMatchObject({ indiaEligible: true, sourceName: 'Remotive', experienceLevel: 'SENIOR' });
    const pe = await prisma.job.findFirstOrThrow({ where: { userId: a.id, externalId: 'remotive:503' } });
    expect(pe).toMatchObject({ indiaEligible: false, experienceLevel: 'SENIOR' });
  });

  it('filters the job list by India eligibility and source, and flags a manual duplicate', async () => {
    const india = await request(app).get('/api/jobs?indiaEligible=true').set(a.auth).expect(200);
    expect(india.body.data.jobs.map((j: { title: string }) => j.title)).toEqual(['Senior Frontend Engineer']);
    const remotive = await request(app).get('/api/jobs?source=Remotive').set(a.auth).expect(200);
    expect(remotive.body.data.total).toBe(2);
    expect(remotive.body.data.jobs[0].sourceName).toBe('Remotive');

    const manual = await request(app).post('/api/jobs').set(a.auth).send({ title: 'Senior Frontend Engineer', companyName: 'Razorpay Ltd', description: 'React role' }).expect(201);
    expect(manual.body.data.possibleDuplicateOf).toBeTruthy();
    const mine = await request(app).get('/api/jobs?source=Added by you').set(a.auth).expect(200);
    expect(mine.body.data.total).toBe(1);
  });
});

describe('saved searches', () => {
  it('saves a cleaned search with a live match count and keeps it private', async () => {
    const created = await request(app).post('/api/jobs/searches').set(a.auth)
      .send({ name: 'Remote React', filters: { q: 'frontend', indiaEligible: 'true', workMode: 'NOT_A_MODE', evil: '$where' }, alertEnabled: true }).expect(201);
    expect(created.body.data.filters).toEqual({ q: 'frontend', indiaEligible: 'true' });
    expect(created.body.data.alertEnabled).toBe(true);

    const list = await request(app).get('/api/jobs/searches').set(a.auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].matches).toBe(1);

    await request(app).post('/api/jobs/searches').set(a.auth).send({ name: 'Empty', filters: {} }).expect(400);
    await request(app).put(`/api/jobs/searches/${created.body.data.id}`).set(b.auth).send({ alertEnabled: false }).expect(404);
    await request(app).delete(`/api/jobs/searches/${created.body.data.id}`).set(b.auth).expect(404);
    expect((await request(app).get('/api/jobs/searches').set(b.auth).expect(200)).body.data).toEqual([]);

    await request(app).put(`/api/jobs/searches/${created.body.data.id}`).set(a.auth).send({ alertEnabled: false }).expect(200);
    expect((await prisma.jobSearch.findUniqueOrThrow({ where: { id: created.body.data.id } })).alertEnabled).toBe(false);
  });
});

describe('ATS score and text diff (no AI)', () => {
  it('scores a complete resume well and explains what a weak one is missing', () => {
    const good = scoreResume(GOOD_RESUME);
    expect(good.score).toBeGreaterThanOrEqual(85);
    expect(good.checks.filter(c => !c.passed).map(c => c.id)).toEqual([]);

    const weak = scoreResume('Rahul. I am a developer. I know computers and like coding a lot.');
    expect(weak.score).toBeLessThan(25);
    const failing = weak.checks.filter(c => !c.passed);
    expect(failing.map(c => c.id)).toEqual(expect.arrayContaining(['email', 'experience', 'metrics']));
    expect(failing.every(c => c.tip)).toBe(true);
  });

  it('checks keywords against a target and counts top skills', () => {
    const r = scoreResume(GOOD_RESUME, { skills: ['React', 'Kubernetes', 'TypeScript', 'Kafka'], label: 'a job' });
    expect(r.keywordMatch).toMatchObject({ score: 50, matched: ['React', 'TypeScript'], missing: ['Kubernetes', 'Kafka'] });
    expect(topSkills([{ skills: ['React', 'Go'] }, { skills: ['react', 'SQL'] }, { skills: ['React'] }])[0]).toEqual({ skill: 'React', count: 3 });
  });

  it('diffs line by line, ignoring whitespace-only changes', () => {
    const d = diffLines('A\nB  \nC\n\nD', 'A\nB\nC2\nD\nE');
    expect(d).toEqual([
      { type: 'same', text: 'A' }, { type: 'same', text: 'B' }, { type: 'removed', text: 'C' }, { type: 'added', text: 'C2' },
      { type: 'same', text: 'D' }, { type: 'added', text: 'E' },
    ]);
  });
});

describe('resume versions', () => {
  let resumeId: string;

  it('creates version 1 on upload', async () => {
    const up = await request(app).post('/api/resumes').set(a.auth).attach('file', SAMPLE_PDF, 'cv.pdf').expect(201);
    const versions = await prisma.resumeVersion.findMany({ where: { resumeId: up.body.data.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, source: 'upload', label: 'Original upload' });
  });

  it('backfills v1 for an older resume, saves an edit as v2, compares and restores', async () => {
    const r = await prisma.resume.create({ data: { userId: a.id, name: 'Old CV', parsedData: { text: GOOD_RESUME.replace(/- Reduced dashboard.*\n/, '') } } });
    resumeId = r.id;
    const v1 = await request(app).get(`/api/resumes/${r.id}/versions`).set(a.auth).expect(200);
    expect(v1.body.data.current).toBe(1);
    expect(v1.body.data.versions).toHaveLength(1);

    await request(app).post(`/api/resumes/${r.id}/versions`).set(a.auth).send({ text: 'too short' }).expect(400);
    const v2 = await request(app).post(`/api/resumes/${r.id}/versions`).set(a.auth).send({ text: GOOD_RESUME, label: 'With metrics' }).expect(201);
    expect(v2.body.data).toMatchObject({ version: 2, source: 'manual', label: 'With metrics' });

    const row = await prisma.resume.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.version).toBe(2);
    expect((row.parsedData as { text: string }).text).toBe(GOOD_RESUME.trim());
    expect(row.extractedSkills).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Docker']));
    expect(row.atsScore).toBe(v2.body.data.atsScore);

    const cmp = await request(app).get(`/api/resumes/${r.id}/compare`).set(a.auth).expect(200);
    // Shown oldest first: v1 → v2 (the version in use)
    expect(cmp.body.data.a).toMatchObject({ version: 1, isCurrent: false });
    expect(cmp.body.data.b).toMatchObject({ version: 2, isCurrent: true });
    expect(cmp.body.data.stats).toMatchObject({ added: 1, removed: 0 });
    expect(cmp.body.data.diff.find((l: { type: string }) => l.type === 'added').text).toMatch(/^- Reduced dashboard load time/);

    const oldId = v1.body.data.versions[0].id;
    await request(app).post(`/api/resumes/${r.id}/versions/${oldId}/restore`).set(a.auth).expect(200);
    expect((await prisma.resume.findUniqueOrThrow({ where: { id: r.id } })).version).toBe(1);
    // Nothing was deleted
    expect(await prisma.resumeVersion.count({ where: { resumeId: r.id } })).toBe(2);
  });

  it('returns the rule-based ATS report with keyword fit against saved jobs', async () => {
    const res = await request(app).get(`/api/resumes/${resumeId}/ats`).set(a.auth).expect(200);
    expect(res.body.data.score).toBeGreaterThan(50);
    expect(res.body.data.checks.length).toBeGreaterThan(10);
    expect(res.body.data.keywordMatch.against).toMatch(/saved jobs/);
  });

  it('keeps versions private to their owner', async () => {
    await request(app).get(`/api/resumes/${resumeId}/versions`).set(b.auth).expect(404);
    await request(app).get(`/api/resumes/${resumeId}/compare`).set(b.auth).expect(404);
    await request(app).get(`/api/resumes/${resumeId}/ats`).set(b.auth).expect(404);
    const v = await prisma.resumeVersion.findFirstOrThrow({ where: { resumeId } });
    await request(app).post(`/api/resumes/${resumeId}/versions/${v.id}/restore`).set(b.auth).expect(404);
    await request(app).get(`/api/resumes/${resumeId}/compare?a=${v.id}&b=nope`).set(a.auth).expect(404);
  });

  it('says clearly when AI is not configured instead of faking an improvement', async () => {
    const res = await request(app).post(`/api/resumes/${resumeId}/improve`).set(a.auth).send({}).expect(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect(await prisma.resumeVersion.count({ where: { resumeId, source: 'ai_improved' } })).toBe(0);
  });
});

describe('applications: assessment stage and recruiter contact', () => {
  it('moves to Assessment, stores recruiter details and keeps a JD snapshot', async () => {
    const job = await prisma.job.create({ data: { userId: a.id, title: 'UI Engineer', companyName: 'Zeta', description: 'Original JD text', skills: ['React'] } });
    const created = await request(app).post('/api/applications').set(a.auth).send({ jobId: job.id, status: 'APPLIED' }).expect(201);
    const id = created.body.data.id;
    await prisma.job.update({ where: { id: job.id }, data: { description: 'Edited later' } });

    await request(app).put(`/api/applications/${id}`).set(a.auth)
      .send({ status: 'ASSESSMENT', recruiterName: 'Anita', recruiterEmail: 'anita@zeta.example', recruiterLinkedin: 'https://linkedin.com/in/anita' }).expect(200);
    await request(app).put(`/api/applications/${id}`).set(a.auth).send({ recruiterEmail: 'not-an-email' }).expect(422);

    const row = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'ASSESSMENT', recruiterName: 'Anita', recruiterEmail: 'anita@zeta.example', jobDescriptionSnapshot: 'Original JD text' });
    await request(app).put(`/api/applications/${id}`).set(b.auth).send({ recruiterName: 'X' }).expect(404);
  });
});

describe('command-center dashboard', () => {
  it('reports interviews, offers, rejections, upcoming interviews, trends and recommendations from real data', async () => {
    const u = await registerUser({ name: 'Dash' });
    const mk = async (title: string, status: 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED', skills: string[]) => {
      const job = await prisma.job.create({ data: { userId: u.id, title, companyName: `${title} Co`, skills } });
      return prisma.application.create({ data: { userId: u.id, jobId: job.id, status, appliedAt: new Date() } });
    };
    await mk('A', 'APPLIED', ['React', 'Kafka']);
    const interviewing = await mk('B', 'INTERVIEW', ['React', 'Kafka']);
    await mk('C', 'OFFER', ['React']);
    await mk('D', 'REJECTED', ['Vue']);
    await prisma.applicationStatusHistory.create({ data: { applicationId: interviewing.id, fromStatus: 'APPLIED', toStatus: 'INTERVIEW' } });
    await prisma.interview.create({ data: { userId: u.id, applicationId: interviewing.id, scheduledAt: new Date(Date.now() + 2 * 86_400_000), meetingUrl: 'https://meet.example/x' } });
    await prisma.interview.create({ data: { userId: u.id, applicationId: interviewing.id, scheduledAt: new Date(Date.now() - 5 * 86_400_000) } });
    await request(app).post('/api/users/profile/skills').set(u.auth).send({ name: 'React' }).expect(201);

    const d = (await request(app).get('/api/analytics/dashboard').set(u.auth).expect(200)).body.data;
    expect(d.kpis).toMatchObject({ totalApplications: 4, interviewing: 1, offers: 1, rejections: 1, appliedThisWeek: 4 });
    expect(d.upcomingInterviews).toHaveLength(1);
    expect(d.upcomingInterviews[0]).toMatchObject({ title: 'B', company: 'B Co', meetingUrl: 'https://meet.example/x' });
    expect(d.activity[0]).toMatchObject({ from: 'APPLIED', to: 'INTERVIEW', title: 'B' });
    expect(d.weekly).toHaveLength(8);
    expect(d.weekly[7].applications).toBe(4);
    expect(d.weekly[7].responses).toBe(3);
    expect(d.monthly).toHaveLength(6);
    expect(d.monthly[5]).toMatchObject({ applications: 4, interviews: 2, offers: 1 });
    expect(d.marketInsights.topSkills[0]).toEqual({ skill: 'React', count: 3, youHave: true });
    expect(d.marketInsights.topSkills.find((s: { skill: string }) => s.skill === 'Kafka')).toEqual({ skill: 'Kafka', count: 2, youHave: false });
    const recs = d.recommendations.map((r: { id: string }) => r.id);
    expect(recs).toEqual(expect.arrayContaining(['upload', 'skills', 'alerts']));
    expect(d.recommendations.find((r: { id: string }) => r.id === 'skills').title).toContain('Kafka');
  });
});
