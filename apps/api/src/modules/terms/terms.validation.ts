import { z } from 'zod';

export const createTermsSchema = z.object({
  title: z.string().trim().min(3, 'Title needs at least 3 characters').max(200),
  contentHtml: z.string().trim().min(1, 'Add the clause text'),
  version: z.string().trim().min(1, 'Add a version, for example v1.0').max(30).default('v1.0'),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sequence: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateTermsSchema = createTermsSchema.partial();

export const listTermsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  isActive: z
    .enum(['true', 'false', 'all'])
    .default('all')
    .transform((value) => (value === 'all' ? undefined : value === 'true')),
});

export type CreateTermsInput = z.infer<typeof createTermsSchema>;
export type UpdateTermsInput = z.infer<typeof updateTermsSchema>;
export type ListTermsQuery = z.infer<typeof listTermsQuerySchema>;
