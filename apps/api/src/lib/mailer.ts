import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;

export const isEmailConfigured = () => Boolean(env.SMTP_HOST);

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

/** Messages "sent" while SMTP is not configured, kept so tests and local dev can read them. */
export const outbox: Mail[] = [];

/**
 * Sends an email. Returns false (and never throws) when sending fails, so a mail outage
 * can't break sign-up or password reset. Without SMTP settings the mail is kept in `outbox`
 * and only its subject and recipient are logged, never its body (it can hold secret links).
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!isEmailConfigured()) {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    logger.warn({ to: mail.to, subject: mail.subject }, 'SMTP is not configured; email not sent');
    return false;
  }
  try {
    await getTransporter().sendMail({ from: env.EMAIL_FROM, ...mail });
    logger.info({ subject: mail.subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err, subject: mail.subject }, 'Email send failed');
    return false;
  }
}

/** Test helper: point the mailer at a custom transport (e.g. nodemailer's jsonTransport). */
export function setTransporterForTests(t: Transporter | null): void {
  transporter = t;
}
