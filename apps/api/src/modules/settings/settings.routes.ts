import { Router } from 'express';
import { Permission } from '@furnix/shared';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { settingsService } from './settings.service';
import { updateSettingsSchema } from './settings.validation';

export const settingsRoutes = Router();

settingsRoutes.get(
  '/',
  authorize(Permission.SETTINGS_VIEW),
  asyncHandler(async (_req, res) => ok(res, await settingsService.get(), 'Settings loaded')),
);

settingsRoutes.patch(
  '/',
  authorize(Permission.SETTINGS_MANAGE),
  validate(updateSettingsSchema),
  asyncHandler(async (req, res) =>
    ok(res, await settingsService.update(req.body, req.user!.id), 'Settings saved'),
  ),
);
