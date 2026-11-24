import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

export const notificationsController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { unreadOnly, page = '1', limit = '20' } = req.query as Record<string, string>;
      const take = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
      const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;
      const where: Record<string, unknown> = { userId: req.user!.id };
      if (unreadOnly === 'true') where['read'] = false;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        prisma.notification.count({ where }),
      ]);

      res.json({ success: true, data: { notifications, total } });
    } catch (e) { next(e); }
  },

  async markRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const n = await prisma.notification.findFirst({ where: { id: req.params['id'], userId: req.user!.id } });
      if (!n) throw new AppError('Notification not found', 404);
      await prisma.notification.update({ where: { id: req.params['id'] }, data: { read: true, readAt: new Date() } });
      res.json({ success: true, data: { read: true } });
    } catch (e) { next(e); }
  },

  async markAllRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true, readAt: new Date() } });
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async delete_(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.notification.deleteMany({ where: { id: req.params['id'], userId: req.user!.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async unreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const count = await prisma.notification.count({ where: { userId: req.user!.id, read: false } });
      res.json({ success: true, data: { count } });
    } catch (e) { next(e); }
  },
};
