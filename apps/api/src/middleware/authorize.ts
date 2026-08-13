import type { NextFunction, Request, Response } from 'express';
import { type Permission, can, canAny } from '@furnix/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

/** Require every listed permission. */
export function authorize(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    const missing = permissions.filter((permission) => !can(req.user!.role, permission));
    if (missing.length > 0) {
      return next(new ForbiddenError(`Your role does not allow this action`));
    }
    next();
  };
}

/** Require at least one of the listed permissions. */
export function authorizeAny(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!canAny(req.user.role, permissions)) {
      return next(new ForbiddenError(`Your role does not allow this action`));
    }
    next();
  };
}

/** Convenience predicate used by serialisers to decide what to redact. */
export function viewerCan(req: Request, permission: Permission): boolean {
  return req.user ? can(req.user.role, permission) : false;
}
