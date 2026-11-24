import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface AuditMeta {
  ip?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export const requestMeta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) });

/** Records a security-relevant event (sign-in, password change, export…). Never throws. */
export async function audit(userId: string, action: string, meta: AuditMeta = {}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: meta.resource,
        resourceId: meta.resourceId,
        details: meta.details ? (meta.details as Prisma.InputJsonValue) : undefined,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  } catch (err) {
    logger.warn({ err, action }, 'Audit log write failed');
  }
}
