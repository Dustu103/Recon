import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { validateServerEnv, ServerEnv, TaroError, ErrorCode } from '@/shared';
import { getHttpStatusForErrorCode } from './shared/errors/status-map';
import { connectDatabase } from './shared/db';
import { authRouter } from './auth/routes/auth.routes';
import { researchRouter } from './research/routes/research.routes';
import { kitRouter } from './kits/routes/kit.routes';
import { jobRouter } from './jobs/routes/job.routes';

// Validate server environment on boot (in test mode, harnesses provide overrides)
let serverEnv: ServerEnv | null = null;
try {
  serverEnv = validateServerEnv();
} catch (err) {
  if (process.env.NODE_ENV !== 'test') {
    throw err;
  }
}

export const app = express();

// Trust loopback and cloud reverse-proxy subnets
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

const allowedOrigins =
  serverEnv?.ALLOWED_ORIGINS ??
  (process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:3000']);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '@taro/server',
  });
});

// ── Auth Routes (D1) ─────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Research & Crawler Routes (D2) ──────────────────────────────────────────
app.use('/api/research', researchRouter);

// ── Kit Routes (D3) ─────────────────────────────────────────────────────────
app.use('/api/kits', kitRouter);

// ── Job Opportunities Routes ────────────────────────────────────────────────
app.use('/api/jobs', jobRouter);

// ── 404 Fallback ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'Endpoint not found',
    },
  });
});

// ── Centralized Error Handling ───────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof TaroError) {
    const status = getHttpStatusForErrorCode(err.code);
    return res.status(status).json({
      error: err.toJSON(),
    });
  }

  // Handle express.json() payload syntax errors
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: ErrorCode.INVALID_INPUT,
        message: 'Malformed JSON payload in request body',
      },
    });
  }

  // Handle unhandled MongoDB duplicate key errors
  if ('code' in err && (err as { code: number }).code === 11000) {
    return res.status(409).json({
      error: {
        code: ErrorCode.USER_EXISTS,
        message: 'A resource with this identifier already exists',
      },
    });
  }

  // Handle Mongoose validation and cast errors
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({
      error: {
        code: ErrorCode.INVALID_INPUT,
        message: err.message,
      },
    });
  }

  console.error('[Taro Server] Unhandled error:', err);
  return res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  });
});

const PORT = serverEnv?.PORT ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 4000);

if (process.env.NODE_ENV !== 'test') {
  connectDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[Taro Server] listening on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Taro Server] Database connection failure on startup:', err);
      process.exit(1);
    });
}
