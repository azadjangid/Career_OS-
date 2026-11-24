import { describe, expect, it } from 'vitest';
import { apiError, formatSalary, toCSV } from './format';
import { nextAction } from './nextAction';

describe('formatSalary', () => {
  it('formats rupees in lakhs and other currencies in thousands', () => {
    expect(formatSalary(600000, 1000000)).toBe('₹6L–₹10L');
    expect(formatSalary(650000)).toBe('₹6.5L+');
    expect(formatSalary(null, 120000, 'USD')).toBe('Up to $120k');
    expect(formatSalary()).toBe('');
  });
});

describe('toCSV', () => {
  it('quotes and guards against spreadsheet formula injection', () => {
    const csv = toCSV([{ a: '=HYPERLINK("x")', b: 'one, two' }]);
    expect(csv).toBe('a,b\n"\'=HYPERLINK(""x"")","one, two"');
  });
});

describe('apiError', () => {
  it('prefers validation details, then the message', () => {
    expect(apiError({ response: { data: { error: { message: 'x', details: [{ message: 'Bad email' }] } } } })).toBe('Bad email');
    expect(apiError({ response: { data: { error: { message: 'Nope' } } } })).toBe('Nope');
    expect(apiError({}, 'Fallback')).toBe('Fallback');
  });
});

describe('nextAction', () => {
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  const base = { status: 'APPLIED' as const, updatedAt: new Date().toISOString(), followUpAt: null, interviews: [] };

  it('puts the next interview first', () => {
    const a = { ...base, followUpAt: inDays(-1), interviews: [{ id: '1', type: 'HR', status: 'SCHEDULED', scheduledAt: inDays(1) }] };
    expect(nextAction(a as never)?.label).toBe('Interview tomorrow');
  });

  it('flags overdue follow-ups and stays quiet on closed applications', () => {
    expect(nextAction({ ...base, followUpAt: inDays(-2) } as never)).toEqual({ label: 'Follow-up overdue 2d', tone: 'red' });
    expect(nextAction({ ...base, status: 'REJECTED', followUpAt: inDays(-2) } as never)).toBeNull();
  });
});
