import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { ROLE_PERMISSIONS } from '@furnix/shared';
import { UnauthorizedError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { authenticate, signAccessToken, signRefreshToken } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password needs at least 8 characters'),
});

export const authRoutes = Router();

authRoutes.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true, deletedAt: null },
    });

    // Same message either way, so the endpoint cannot be used to enumerate accounts.
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) throw new UnauthorizedError('Email or password is incorrect');

    return ok(
      res,
      {
        accessToken: signAccessToken({
          sub: user.id,
          role: user.role,
          email: user.email,
          name: user.name,
        }),
        refreshToken: signRefreshToken(user.id),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: ROLE_PERMISSIONS[user.role],
        },
      },
      `Welcome back, ${user.name.split(' ')[0]}`,
    );
  }),
);

authRoutes.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) =>
    ok(
      res,
      { ...req.user, permissions: ROLE_PERMISSIONS[req.user!.role] },
      'Session loaded',
    ),
  ),
);
