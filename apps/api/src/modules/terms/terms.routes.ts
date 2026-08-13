import { Router } from 'express';
import { Permission } from '@furnix/shared';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { termsController } from './terms.controller';
import { createTermsSchema, listTermsQuerySchema, updateTermsSchema } from './terms.validation';

export const termsRoutes = Router();

termsRoutes.get(
  '/',
  authorize(Permission.TERMS_VIEW),
  validate(listTermsQuerySchema, 'query'),
  asyncHandler(termsController.list),
);
termsRoutes.get('/defaults', authorize(Permission.TERMS_VIEW), asyncHandler(termsController.defaults));
termsRoutes.get('/active', authorize(Permission.TERMS_VIEW), asyncHandler(termsController.active));
termsRoutes.get('/:id', authorize(Permission.TERMS_VIEW), asyncHandler(termsController.detail));

termsRoutes.post(
  '/',
  authorize(Permission.TERMS_MANAGE),
  validate(createTermsSchema),
  asyncHandler(termsController.create),
);
termsRoutes.patch(
  '/:id',
  authorize(Permission.TERMS_MANAGE),
  validate(updateTermsSchema),
  asyncHandler(termsController.update),
);
termsRoutes.delete('/:id', authorize(Permission.TERMS_MANAGE), asyncHandler(termsController.remove));
