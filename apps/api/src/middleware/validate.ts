import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ValidationError } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

/**
 * Parses and REPLACES the request segment with the parsed result, so downstream
 * handlers receive coerced, trimmed, typed data rather than raw strings.
 */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        // req.query is a getter in Express 5; assign field by field to stay safe.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      } else {
        req[source] = parsed;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError(
            'Some fields need attention',
            error.issues.map((issue) => ({
              field: issue.path.join('.') || source,
              message: issue.message,
            })),
          ),
        );
        return;
      }
      next(error);
    }
  };
}
