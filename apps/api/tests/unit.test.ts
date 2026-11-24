import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeIcsText } from '../src/lib/ics';
import { detectResumeType } from '../src/lib/resumeFiles';
import { escapeHtml, passwordResetEmail } from '../src/lib/emailTemplates';
import { cleanCompanySlugs, mapAdzuna, mapArbeitnow, mapGreenhouse, mapLever, mapRemoteOk, stripHtml } from '../src/lib/jobFeeds';
import { readJobSourceSettings } from '../src/lib/jobImport';
import { SAMPLE_PDF } from './helpers';

describe('calendar files', () => {
  it('escapes text and folds long lines', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const ics = buildCalendar([{ uid: 'x', start: new Date('2030-01-01T00:00:00Z'), durationMinutes: 30, title: 'T'.repeat(200), description: 'नमस्ते '.repeat(30) }]);
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics).toContain('DTEND:20300101T003000Z');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('marks cancelled interviews and drops non-http URLs', () => {
    const ics = buildCalendar([{ uid: 'y', start: new Date(), durationMinutes: 60, title: 'x', url: 'javascript:alert(1)', cancelled: true }]);
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).not.toContain('javascript:');
  });
});

describe('resume type detection', () => {
  it('trusts content, not the extension', () => {
    expect(detectResumeType(SAMPLE_PDF, 'cv.PDF')).toBe('.pdf');
    expect(detectResumeType(SAMPLE_PDF, 'cv.docx')).toBeNull();
    const fakeDocx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml....')]);
    expect(detectResumeType(fakeDocx, 'cv.docx')).toBe('.docx');
    expect(detectResumeType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'cv.docx')).toBeNull();
    expect(detectResumeType(Buffer.from('hello'), 'cv.pdf')).toBeNull();
    expect(detectResumeType(SAMPLE_PDF, 'cv.doc')).toBeNull();
  });
});

describe('emails', () => {
  it('escapes user-controlled text in HTML', () => {
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
    const m = passwordResetEmail({ email: 'a@b.c', name: '<img src=x onerror=alert(1)>' }, 'abc123');
    expect(m.html).not.toContain('<img');
    expect(m.text).toContain('http://app.test/reset-password?token=abc123');
  });
});

describe('job feed mappers', () => {
  it('strips HTML safely', () => {
    expect(stripHtml('<p>Hello&nbsp;<b>world</b></p><script>x()</script>')).toBe('Hello world');
  });

  it('maps RemoteOK, skipping its legal-notice row and filtering by search', () => {
    const jobs = mapRemoteOk([{ legal: 'notice' } as never, { id: 5, position: 'React Dev', company: 'X', tags: ['react'], url: 'https://remoteok.com/5', epoch: 1_700_000_000 }, { id: 6, position: 'Go Dev', company: 'Y' }], 'react');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ externalId: 'remoteok:5', workMode: 'REMOTE' });
    expect(jobs[0]!.postedAt).toEqual(new Date(1_700_000_000 * 1000));
  });

  it('maps Arbeitnow, Adzuna, Greenhouse and Lever', () => {
    expect(mapArbeitnow({ data: [{ slug: 's', company_name: 'C', title: 'T', remote: true, url: 'u', job_types: ['Full-Time'] }] })[0]).toMatchObject({ externalId: 'arbeitnow:s', workMode: 'REMOTE', jobType: 'FULL_TIME' });
    expect(mapAdzuna({ results: [{ id: '1', title: '<strong>SDE</strong>', redirect_url: 'u', company: { display_name: 'Infosys' }, location: { display_name: 'Pune, Maharashtra', area: ['India', 'Maharashtra', 'Pune'] }, salary_min: 600000.4 }] })[0]).toMatchObject({ title: 'SDE', companyName: 'Infosys', city: 'Pune', salaryMin: 600000 });
    expect(mapGreenhouse('postman', { jobs: [{ id: 1, title: 'Engineer', absolute_url: 'u', location: { name: 'Remote, India' }, content: '&lt;p&gt;Hi&lt;/p&gt;' }] })[0]).toMatchObject({ externalId: 'greenhouse:postman:1', companyName: 'Postman', workMode: 'REMOTE', description: 'Hi' });
    expect(mapLever('plaid', [{ id: 'a', text: 'Eng', hostedUrl: 'h', workplaceType: 'onsite', categories: { commitment: 'Intern' } }])[0]).toMatchObject({ externalId: 'lever:plaid:a', workMode: 'ONSITE', jobType: 'INTERNSHIP' });
  });

  it('only accepts safe company board slugs', () => {
    expect(cleanCompanySlugs(['Postman', 'postman', '../etc', 'a b', 'razor-pay'])).toEqual(['postman', 'razor-pay']);
    expect(cleanCompanySlugs('nope')).toEqual([]);
  });

  it('reads job source settings with safe defaults', () => {
    expect(readJobSourceSettings({})).toEqual({ sources: ['remotive'], greenhouse: [], lever: [], autoFetch: false });
    expect(readJobSourceSettings({ jobSources: ['linkedin', 'lever'], autoFetchJobs: true, companyBoards: { lever: ['plaid'] } })).toEqual({ sources: ['lever'], greenhouse: [], lever: ['plaid'], autoFetch: true });
  });
});
