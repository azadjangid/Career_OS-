import { Worker, Job } from 'bullmq';
import pino from 'pino';
import nodemailer from 'nodemailer';
import { prisma } from '../prisma';
import { getConnectionOptions } from '../redis';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface NotificationPayload {
  userId: string;
  type: 'JOB_MATCH' | 'APPLICATION_UPDATE' | 'INTERVIEW_REMINDER' | 'WELCOME';
  data: Record<string, unknown>;
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

function renderEmailTemplate(type: string, data: Record<string, unknown>): { subject: string; html: string } {
  switch (type) {
    case 'JOB_MATCH':
      return {
        subject: `🎯 ${data.count} new job matches for you — CareerOS`,
        html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #FF7A3D;">New Job Matches!</h1>
  <p>We found <strong>${data.count}</strong> new jobs matching your profile on CareerOS.</p>
  <a href="${process.env.FRONTEND_URL}/jobs" style="background:#FF7A3D;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;">View Matches</a>
  <p style="color:#666;font-size:12px;margin-top:32px;">CareerOS — AI Career Operating System</p>
</div>`,
      };

    case 'APPLICATION_UPDATE':
      return {
        subject: `📋 Application update: ${data.company} — CareerOS`,
        html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #FF7A3D;">Application Update</h1>
  <p>Your application for <strong>${data.role}</strong> at <strong>${data.company}</strong> has been updated to <strong>${data.status}</strong>.</p>
  <a href="${process.env.FRONTEND_URL}/applications" style="background:#FF7A3D;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;">View Applications</a>
</div>`,
      };

    case 'WELCOME':
      return {
        subject: `Welcome to CareerOS! 🚀`,
        html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #FF7A3D;">Welcome to CareerOS!</h1>
  <p>Hi ${data.name}, your AI-powered career platform is ready.</p>
  <p>Get started by:</p>
  <ul>
    <li>Completing your profile</li>
    <li>Uploading your resume for AI analysis</li>
    <li>Browsing job matches</li>
  </ul>
  <a href="${process.env.FRONTEND_URL}/dashboard" style="background:#FF7A3D;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;">Get Started</a>
</div>`,
      };

    default:
      return { subject: 'CareerOS Notification', html: '<p>You have a new notification.</p>' };
  }
}

export const notificationsWorker = new Worker<NotificationPayload>(
  'notifications',
  async (job: Job<NotificationPayload>) => {
    const { userId, type, data } = job.data;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return;

    // Save in-app notification
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: type.replace(/_/g, ' '),
        body: JSON.stringify(data),
        metadata: data as any,
      },
    });

    // Send email if SMTP configured
    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      const { subject, html } = renderEmailTemplate(type, { ...data, name: user.name });
      try {
        await getTransporter().sendMail({
          from: `"CareerOS" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject,
          html,
        });
        logger.info({ userId, type }, 'Email sent');
      } catch (err) {
        logger.error({ err, userId, type }, 'Email send failed');
      }
    }

    return { sent: true };
  },
  { ...getConnectionOptions(), concurrency: 5 }
);
