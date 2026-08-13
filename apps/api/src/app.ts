import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRoutes } from './routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
    }),
  );

  app.use(compression());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow Postman, curl and server-to-server requests
        if (!origin) {
          return callback(null, true);
        }

        // Origins already configured in environment variables
        const isConfiguredOrigin = env.corsOrigins.includes(origin);

        // Allow local network frontend URLs only in development
        const isLocalNetworkOrigin =
          !env.isProduction &&
          /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):5173$/.test(
            origin,
          );

        if (isConfiguredOrigin || isLocalNetworkOrigin) {
          return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} is not allowed`));
      },

      credentials: true,

      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
      ],
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  morgan.token(
    'id',
    (req) => (req as express.Request).requestId ?? '-',
  );

  app.use(
    morgan(
      env.isProduction
        ? ':id :method :url :status :response-time ms'
        : 'dev',
    ),
  );

  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        data: null,
        message: 'Too many requests. Try again shortly.',
        error: {
          code: 'RATE_LIMITED',
        },
      },
    }),
  );

  app.use('/api/v1', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}