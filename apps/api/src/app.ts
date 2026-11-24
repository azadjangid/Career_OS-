import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import crypto from 'crypto';
import morgan from 'morgan';

import { env } from './config/env';
import { logger } from './config/logger';
import { globalRateLimit } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();

// Behind nginx / a load balancer the client IP is in X-Forwarded-For. Without this every
// user shares the proxy's IP and the rate limiter locks everyone out together.
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

// Security headers. The API only returns JSON and file downloads, so it can use the strictest CSP.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

// Request id: echoed in a header, error responses and log lines so a user-reported error can be found
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  (req as express.Request & { id?: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// CORS
const allowedOrigins = env.CORS_ORIGINS.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
}));

// Parsing & compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
// Never compress SSE streams: the compressor would buffer events instead of flushing them
app.use(compression({ filter: (req, res) => (req.path.endsWith('/stream') ? false : compression.filter(req, res)) }));

// Logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
}

// Rate limiting
app.use(globalRateLimit);

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
