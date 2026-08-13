import { Router } from 'express';
import { Permission } from '@furnix/shared';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { moduleController } from './module.controller';
import {
  createModuleSchema,
  listModulesQuerySchema,
  reorderModulesSchema,
  updateModuleSchema,
} from './module.validation';

export const moduleRoutes = Router();

moduleRoutes.get(
  '/',
  authorize(Permission.MODULE_VIEW),
  validate(listModulesQuerySchema, 'query'),
  asyncHandler(moduleController.list),
);

moduleRoutes.get(
  '/selectable',
  authorize(Permission.MODULE_VIEW),
  asyncHandler(moduleController.selectable),
);

moduleRoutes.get('/:id', authorize(Permission.MODULE_VIEW), asyncHandler(moduleController.detail));

moduleRoutes.post(
  '/',
  authorize(Permission.MODULE_MANAGE),
  validate(createModuleSchema),
  asyncHandler(moduleController.create),
);

moduleRoutes.patch(
  '/reorder',
  authorize(Permission.MODULE_MANAGE),
  validate(reorderModulesSchema),
  asyncHandler(moduleController.reorder),
);

moduleRoutes.patch(
  '/:id',
  authorize(Permission.MODULE_MANAGE),
  validate(updateModuleSchema),
  asyncHandler(moduleController.update),
);

moduleRoutes.delete(
  '/:id',
  authorize(Permission.MODULE_MANAGE),
  asyncHandler(moduleController.remove),
);

moduleRoutes.post(
  '/:id/restore',
  authorize(Permission.MODULE_MANAGE),
  asyncHandler(moduleController.restore),
);
