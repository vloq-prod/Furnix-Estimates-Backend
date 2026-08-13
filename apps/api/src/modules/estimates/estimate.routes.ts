import { Router } from 'express';
import { Permission } from '@furnix/shared';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { estimateController } from './estimate.controller';
import {
  createEstimateSchema,
  listEstimatesQuerySchema,
  previewPricingSchema,
  updateEstimateSchema,
  updateStatusSchema,
} from './estimate.validation';

export const estimateRoutes = Router();

// Reads
estimateRoutes.get(
  '/',
  authorize(Permission.ESTIMATE_VIEW),
  validate(listEstimatesQuerySchema, 'query'),
  asyncHandler(estimateController.list),
);
estimateRoutes.get('/summary', authorize(Permission.ESTIMATE_VIEW), asyncHandler(estimateController.summary));
estimateRoutes.get('/:id', authorize(Permission.ESTIMATE_VIEW), asyncHandler(estimateController.detail));
estimateRoutes.get('/:id/preview', authorize(Permission.ESTIMATE_VIEW), asyncHandler(estimateController.preview));
estimateRoutes.get('/:id/activity', authorize(Permission.ESTIMATE_VIEW), asyncHandler(estimateController.activity));
estimateRoutes.get('/:id/revisions', authorize(Permission.ESTIMATE_VIEW), asyncHandler(estimateController.revisions));
estimateRoutes.get('/:id/pdf', authorize(Permission.ESTIMATE_VIEW), asyncHandler(estimateController.downloadPdf));

// Live pricing for the builder
estimateRoutes.post(
  '/calculate',
  authorize(Permission.ESTIMATE_VIEW),
  validate(previewPricingSchema),
  asyncHandler(estimateController.calculate),
);

// Writes
estimateRoutes.post(
  '/',
  authorize(Permission.ESTIMATE_CREATE),
  validate(createEstimateSchema),
  asyncHandler(estimateController.create),
);
estimateRoutes.put(
  '/:id',
  authorize(Permission.ESTIMATE_UPDATE),
  validate(updateEstimateSchema),
  asyncHandler(estimateController.update),
);
estimateRoutes.patch(
  '/:id/status',
  authorize(Permission.ESTIMATE_STATUS),
  validate(updateStatusSchema),
  asyncHandler(estimateController.updateStatus),
);
estimateRoutes.post(
  '/:id/duplicate',
  authorize(Permission.ESTIMATE_CREATE),
  asyncHandler(estimateController.duplicate),
);
estimateRoutes.delete('/:id', authorize(Permission.ESTIMATE_DELETE), asyncHandler(estimateController.remove));
estimateRoutes.post('/:id/restore', authorize(Permission.ESTIMATE_DELETE), asyncHandler(estimateController.restore));

// Maintenance
estimateRoutes.post(
  '/maintenance/expire-overdue',
  authorize(Permission.ESTIMATE_STATUS),
  asyncHandler(estimateController.expireOverdue),
);
