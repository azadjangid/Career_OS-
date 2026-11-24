import { env } from '../config/env';
import type { Mail } from './mailer';

const ACCENT = '#FF7A3D';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const appUrl = (p: string) => `${env.FRONTEND_URL.replace(/\/$/, '')}${p}`;

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:${ACCENT};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
<h1 style="color:${ACCENT};font-size:22px">${escapeHtml(title)}</h1>
${bodyHtml}
${button}
<p style="color:#6b7280;font-size:12px;margin-top:32px">${escapeHtml(env.APP_NAME)} · <a href="${escapeHtml(appUrl('/settings'))}" style="color:#6b7280">Email settings</a></p>
</div>`;
}

type To = { email: string; name: string };

export function passwordResetEmail(to: To, token: string): Mail {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return {
    to: to.email,
    subject: `Reset your ${env.APP_NAME} password`,
    html: layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(to.name)},</p><p>Someone asked to reset the password for your account. The link works for 1 hour.</p><p>If this wasn't you, you can ignore this email.</p>`,
      { label: 'Choose a new password', url },
    ),
    text: `Hi ${to.name},\n\nReset your password (link valid for 1 hour):\n${url}\n\nIf this wasn't you, ignore this email.`,
  };
}

export function verifyEmailEmail(to: To, token: string): Mail {
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return {
    to: to.email,
    subject: `Confirm your email for ${env.APP_NAME}`,
    html: layout(
      'Confirm your email',
      `<p>Hi ${escapeHtml(to.name)},</p><p>Welcome to ${escapeHtml(env.APP_NAME)}! Please confirm this is your email address. The link works for 24 hours.</p>`,
      { label: 'Confirm email', url },
    ),
    text: `Hi ${to.name},\n\nConfirm your email (link valid for 24 hours):\n${url}`,
  };
}

export interface ReminderItem {
  label: string;
  detail: string;
}

export function remindersEmail(to: To, interviews: ReminderItem[], followUps: ReminderItem[]): Mail {
  const list = (items: ReminderItem[]) =>
    `<ul>${items.map(i => `<li><strong>${escapeHtml(i.label)}</strong> · ${escapeHtml(i.detail)}</li>`).join('')}</ul>`;
  const parts: string[] = [`<p>Hi ${escapeHtml(to.name)}, here's what's coming up.</p>`];
  const text: string[] = [`Hi ${to.name}, here's what's coming up.`];
  if (interviews.length) {
    parts.push(`<h3>Interviews in the next 24 hours</h3>${list(interviews)}`);
    text.push('Interviews in the next 24 hours:', ...interviews.map(i => `- ${i.label} · ${i.detail}`));
  }
  if (followUps.length) {
    parts.push(`<h3>Follow-ups due</h3>${list(followUps)}`);
    text.push('Follow-ups due:', ...followUps.map(i => `- ${i.label} · ${i.detail}`));
  }
  const n = interviews.length + followUps.length;
  return {
    to: to.email,
    subject: interviews.length
      ? `${interviews.length} interview${interviews.length > 1 ? 's' : ''} coming up · ${env.APP_NAME}`
      : `${n} follow-up${n > 1 ? 's' : ''} due today · ${env.APP_NAME}`,
    html: layout('Your daily reminders', parts.join(''), { label: 'Open applications', url: appUrl('/applications') }),
    text: text.join('\n'),
  };
}

export function jobAlertEmail(to: To, count: number): Mail {
  return {
    to: to.email,
    subject: `${count} new job${count > 1 ? 's' : ''} for you · ${env.APP_NAME}`,
    html: layout('New jobs found', `<p>Hi ${escapeHtml(to.name)}, we imported <strong>${count}</strong> new job${count > 1 ? 's' : ''} from your job sources.</p>`, {
      label: 'View jobs',
      url: appUrl('/jobs'),
    }),
    text: `Hi ${to.name}, we imported ${count} new jobs from your job sources: ${appUrl('/jobs')}`,
  };
}

/** Generic list email used by the saved-search alert, daily summary and weekly report. */
export function digestEmail(to: To, opts: { subject: string; title: string; intro: string; lines: string[]; cta: { label: string; path: string } }): Mail {
  const items = opts.lines.map(l => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join('');
  return {
    to: to.email,
    subject: `${opts.subject} · ${env.APP_NAME}`,
    html: layout(opts.title, `<p>Hi ${escapeHtml(to.name)}, ${escapeHtml(opts.intro)}</p><ul>${items}</ul>`, { label: opts.cta.label, url: appUrl(opts.cta.path) }),
    text: `Hi ${to.name}, ${opts.intro}\n\n${opts.lines.map(l => `- ${l}`).join('\n')}\n\n${appUrl(opts.cta.path)}`,
  };
}
