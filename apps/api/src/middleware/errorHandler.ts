import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    data: null,
    message: `No route matches ${req.method} ${req.originalUrl}`,
    error: { code: 'ROUTE_NOT_FOUND' },
    timestamp: new Date().toISOString(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const { statusCode, code, message, details } = normalise(error);

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, error);
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error: {
      code,
      ...(details !== undefined ? { details } : {}),
      ...(env.isProduction ? {} : { stack: error instanceof Error ? error.stack : undefined }),
    },
    timestamp: new Date().toISOString(),
  });
}

function normalise(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: 'Some fields need attention',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return {
          statusCode: 409,
          code: 'DUPLICATE_RECORD',
          message: `A record with this ${target} already exists`,
        };
      }
      case 'P2003':
        return {
          statusCode: 409,
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: 'This record is referenced elsewhere and cannot be changed',
        };
      case 'P2025':
        return { statusCode: 404, code: 'NOT_FOUND', message: 'Record not found' };
      default:
        return { statusCode: 400, code: `PRISMA_${error.code}`, message: 'Database request failed' };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, code: 'PRISMA_VALIDATION', message: 'Database request was malformed' };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: env.isProduction ? 'Something went wrong on our side' : String(error),
  };
}
