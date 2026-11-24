import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { captureError } from '../lib/sentry';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      },
    });
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'Resource already exists' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
      });
      return;
    }
  }

  // Upload errors (file too large, too many files)
  if (err.name === 'MulterError') {
    const code = (err as Error & { code?: string }).code;
    res.status(code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      success: false,
      error: { code: code ?? 'UPLOAD_ERROR', message: code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message },
    });
    return;
  }

  // Malformed JSON body
  if ((err as Error & { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
    return;
  }

  // CORS rejections
  if (err.message?.startsWith('CORS blocked')) {
    res.status(403).json({ success: false, error: { code: 'CORS', message: 'Origin not allowed' } });
    return;
  }

  // App errors
  if (err instanceof AppError) {
    // Server-side failures (5xx) are worth a log line even when we chose the message
    if (err.statusCode >= 500) logger.warn({ code: err.code, status: err.statusCode, requestId: (req as Request & { id?: string }).id }, `${req.method} ${req.path}: ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code ?? 'ERROR', message: err.message },
    });
    return;
  }

  // Unknown errors — log full details but never expose to client
  const requestId = (req as Request & { id?: string }).id;
  logger.error({ err, requestId }, `Unhandled error: ${req.method} ${req.path}`);
  captureError(err, { method: req.method, path: req.route?.path ?? req.path, requestId });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: `An unexpected error occurred${requestId ? ` (reference ${requestId})` : ''}`, requestId },
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};
