import { formatDistanceToNowStrict, format, differenceInCalendarDays, isValid } from 'date-fns';
import { STATUS_LABEL, type AppStatus } from './constants';

export const formatStatus = (s: string): string =>
  STATUS_LABEL[s as AppStatus] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

export function formatSalary(min?: number | null, max?: number | null, currency = 'INR'): string {
  const fmt = (n: number) => (currency === 'INR' ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `$${Math.round(n / 1000)}k`);
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return '';
}

const toDate = (d?: string | Date | null): Date | null => {
  if (!d) return null;
  const x = typeof d === 'string' ? new Date(d) : d;
  return isValid(x) ? x : null;
};

export const timeAgo = (d?: string | Date | null): string => {
  const x = toDate(d);
  return x ? `${formatDistanceToNowStrict(x)} ago` : '—';
};

export const formatDate = (d?: string | Date | null, pattern = 'd MMM yyyy'): string => {
  const x = toDate(d);
  return x ? format(x, pattern) : '—';
};

/** Whole days from today to the date (negative = in the past). */
export const daysUntil = (d?: string | Date | null): number | null => {
  const x = toDate(d);
  return x ? differenceInCalendarDays(x, new Date()) : null;
};

export const matchTone = (score: number): 'green' | 'amber' | 'red' => (score > 80 ? 'green' : score >= 50 ? 'amber' : 'red');

export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('') || '?';

/** Stable pastel-ish colour per company name so logo placeholders look distinct. */
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

export function downloadBlob(filename: string, content: BlobPart, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC 4180 CSV with formula-injection guard (cells starting with = + - @ are prefixed with '). */
export function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

export function apiError(e: unknown, fallback = 'Something went wrong'): string {
  const err = e as { response?: { data?: { error?: { message?: string; details?: Array<{ message: string }> } | string } }; message?: string };
  const data = err.response?.data?.error;
  if (typeof data === 'string') return data;
  if (data?.details?.length) return data.details.map(d => d.message).join('. ');
  return data?.message ?? err.message ?? fallback;
}
