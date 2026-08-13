import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@furnix/shared';
import { env } from '../config/env';
import { UnauthorizedError } from '../lib/errors';
import { prisma } from '../lib/prisma';

interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();

    const token = header.slice(7).trim();
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

    // Re-read the user so a role change or deactivation takes effect immediately
    // rather than at token expiry.
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) throw new UnauthorizedError('This account is no longer active');

    req.user = user as Request['user'];
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Your session expired. Sign in again.'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError());
      return;
    }
    next(error);
  }
}
