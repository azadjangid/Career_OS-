import type { Application } from './types';
import { daysUntil } from './format';

export interface NextAction { label: string; tone: 'red' | 'amber' | 'blue' | 'muted' }

/** Single most useful reminder to show on an application card. */
export function nextAction(a: Pick<Application, 'status' | 'followUpAt' | 'updatedAt' | 'interviews'>): NextAction | null {
  if (a.status === 'REJECTED' || a.status === 'WITHDRAWN' || a.status === 'OFFER') return null;

  const nextInterview = (a.interviews ?? [])
    .filter(i => i.status === 'SCHEDULED' && i.scheduledAt && (daysUntil(i.scheduledAt) ?? -1) >= 0)
    .sort((x, y) => +new Date(x.scheduledAt!) - +new Date(y.scheduledAt!))[0];
  if (nextInterview) {
    const d = daysUntil(nextInterview.scheduledAt)!;
    return { label: d === 0 ? 'Interview today' : d === 1 ? 'Interview tomorrow' : `Interview in ${d}d`, tone: d <= 1 ? 'red' : 'blue' };
  }

  const f = daysUntil(a.followUpAt);
  if (f !== null) {
    if (f < 0) return { label: `Follow-up overdue ${-f}d`, tone: 'red' };
    if (f === 0) return { label: 'Follow up today', tone: 'amber' };
    return { label: `Follow up in ${f}d`, tone: f <= 2 ? 'amber' : 'muted' };
  }

  const idle = -(daysUntil(a.updatedAt) ?? 0);
  if (a.status !== 'SAVED' && a.status !== 'READY_TO_APPLY' && idle >= 7) return { label: `No update in ${idle}d`, tone: 'amber' };
  if (a.status === 'SAVED' || a.status === 'READY_TO_APPLY') return { label: 'Ready to apply?', tone: 'muted' };
  return null;
}

export const ACTION_BADGE: Record<NextAction['tone'], string> = {
  red: 'badge-red', amber: 'badge-amber', blue: 'badge-blue', muted: 'badge-muted',
};
