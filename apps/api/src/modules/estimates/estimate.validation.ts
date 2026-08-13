import { z } from 'zod';

const money = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value) && value >= 0, 'Enter an amount of zero or more');

const optionalMoney = money.nullable().optional();

const isoDate = z
  .union([z.string(), z.date()])
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), 'Enter a valid date');

export const estimateModuleInputSchema = z.object({
  moduleId: z.string().uuid('Select a module from the list'),
  /** Per-estimate overrides. Null clears the override and returns to master pricing. */
  overrideOneTimeFee: optionalMoney,
  sequence: z.coerce.number().int().min(0).max(9999).optional(),
  userCount: z.coerce.number().int().min(0).optional(),
});

export const termClauseInputSchema = z.object({
  sourceTemplateId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, 'Add a clause title').max(200),
  contentHtml: z.string().trim().min(1, 'Add the clause text'),
  version: z.string().trim().max(30).nullable().optional(),
  sequence: z.coerce.number().int().min(0).max(999),
  isCustom: z.boolean().default(false),
});

/** Internal only. Rejected outright unless the caller holds the permission. */
export const adjustmentInputSchema = z
  .object({
    type: z.enum(['NONE', 'FIXED', 'PERCENT']).default('NONE'),
    value: money.default(0),
    scope: z.enum(['ONE_TIME', 'RECURRING', 'BOTH']).default('ONE_TIME'),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (input) => input.type !== 'PERCENT' || input.value <= 100,
    { message: 'A percentage cannot exceed 100', path: ['value'] },
  )
  .refine(
    (input) => input.type === 'NONE' || input.value > 0,
    { message: 'Enter a value above zero', path: ['value'] },
  );

const estimateBase = z.object({
  estimateDate: isoDate,
  validUntil: isoDate,

  clientCompanyName: z.string().trim().min(2, 'Enter the client company name').max(200),
  contactPerson: z.string().trim().max(150),
  email: z.string().trim().email('Enter a valid email address').max(180),
  mobile: z
    .string()
    .trim()
    .regex(/^(\+\d{1,3}[- ]?)?\d{10}$/, 'Enter a 10-digit mobile number'),
  billingAddress: z.string().trim().max(1000),
  gstin: z
    .string()
    .trim()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Enter a valid 15-character GSTIN',
    )
    .nullable()
    .optional()
    .or(z.literal('')),

  hostingModel: z.enum(['VLOQ_CLOUD', 'CLIENT_OWNED']),
  userCount: z.coerce.number().int().min(0, 'User count cannot be negative').max(100000),
  /**
   * Per-estimate override of the configured platform user rate. Null keeps the
   * rate from company settings. Module selection never affects this.
   */
  userRateOverride: optionalMoney,
  gstPercent: z.coerce.number().min(0).max(100).default(18),

  modules: z.array(estimateModuleInputSchema).min(1, 'Select at least one module'),
  clauses: z.array(termClauseInputSchema).default([]),

  notes: z.string().trim().max(4000).nullable().optional(),
  termsIntro: z.string().trim().max(2000).nullable().optional(),

  adjustment: adjustmentInputSchema.optional(),
});

export const createEstimateSchema = estimateBase
  .refine((input) => input.validUntil >= input.estimateDate, {
    message: 'Valid-until date must be on or after the estimate date',
    path: ['validUntil'],
  })
  .refine(
    (input) => input.hostingModel !== 'VLOQ_CLOUD' || input.userCount >= 1,
    { message: 'Cloud hosting needs at least one user', path: ['userCount'] },
  )
  .refine(
    (input) => new Set(input.modules.map((module) => module.moduleId)).size === input.modules.length,
    { message: 'The same module is selected more than once', path: ['modules'] },
  );

export const updateEstimateSchema = createEstimateSchema;

export const updateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  note: z.string().trim().max(400).optional(),
});

export const listEstimatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(150).optional(),
  status: z
    .union([
      z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'ALL']),
      z.array(z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'])),
    ])
    .optional()
    .transform((value) => {
      if (!value || value === 'ALL') return undefined;
      return Array.isArray(value) ? value : [value];
    }),
  hostingModel: z.enum(['VLOQ_CLOUD', 'CLIENT_OWNED', 'ALL']).optional()
    .transform((value) => (!value || value === 'ALL' ? undefined : value)),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  createdById: z.string().uuid().optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sortBy: z
    .enum(['createdAt', 'estimateDate', 'estimateNumber', 'netPayableOneTime', 'clientCompanyName', 'validUntil'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

/** Live recalculation for the builder. Nothing is persisted. */
export const previewPricingSchema = z.object({
  hostingModel: z.enum(['VLOQ_CLOUD', 'CLIENT_OWNED']),
  userCount: z.coerce.number().int().min(0).max(100000),
  /** Per-estimate override of the configured platform user rate. */
  userRateOverride: optionalMoney,
  gstPercent: z.coerce.number().min(0).max(100).default(18),
  modules: z.array(estimateModuleInputSchema).default([]),
  adjustment: adjustmentInputSchema.optional(),
});

export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>;
export type ListEstimatesQuery = z.infer<typeof listEstimatesQuerySchema>;
export type PreviewPricingInput = z.infer<typeof previewPricingSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
