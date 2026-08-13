import { z } from 'zod';

const money = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value) && value >= 0, 'Enter an amount of zero or more')
  .refine((value) => value <= 99_999_999.99, 'Amount is larger than this field allows');

export const createModuleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Code needs at least 2 characters')
    .max(60)
    .regex(/^[A-Z0-9_]+$/, 'Use uppercase letters, numbers and underscores only'),
  name: z.string().trim().min(2, 'Name needs at least 2 characters').max(150),
  description: z.string().trim().max(2000).optional().nullable(),
  cloudSetupFee: money.default(0),
  selfHostedSetupFee: money.default(0),
  isActive: z.boolean().default(true),
  sequence: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateModuleSchema = createModuleSchema.partial().omit({ code: true });

export const reorderModulesSchema = z.object({
  order: z
    .array(z.object({ id: z.string().uuid(), sequence: z.number().int().min(0) }))
    .min(1, 'Send at least one module'),
});

export const listModulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  isActive: z
    .enum(['true', 'false', 'all'])
    .default('all')
    .transform((value) => (value === 'all' ? undefined : value === 'true')),
  sortBy: z.enum(['sequence', 'name', 'code', 'createdAt', 'cloudSetupFee']).default('sequence'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ListModulesQuery = z.infer<typeof listModulesQuerySchema>;
