import { z } from 'zod';

export const updateSettingsSchema = z.object({
  legalName: z.string().trim().min(2).max(200).optional(),
  brandName: z.string().trim().min(2).max(120).optional(),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Enter a valid 15-character GSTIN')
    .optional()
    .nullable()
    .or(z.literal('')),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(100).optional(),
  email: z.string().trim().email('Enter a valid email').optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(30).optional().nullable(),
  website: z.string().trim().url('Enter a full URL').optional().nullable().or(z.literal('')),
  logoUrl: z.string().trim().max(400).optional().nullable().or(z.literal('')),

  defaultGstPercent: z.coerce.number().min(0).max(100).optional(),

  /**
   * Platform user pricing. Charged per user per month regardless of how many
   * modules a client takes. Snapshotted onto each estimate on save, so changing
   * it here never rewrites an estimate that has already gone out.
   */
  monthlyPricePerUser: z.coerce.number().min(0).max(10000000).optional(),
  userLineLabel: z.string().trim().min(1).max(120).optional(),
  defaultValidityDays: z.coerce.number().int().min(1).max(365).optional(),
  estimateNumberPrefix: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9/-]+$/, 'Use uppercase letters, numbers, slashes and hyphens')
    .optional(),

  bankName: z.string().trim().max(150).optional().nullable(),
  bankAccountNumber: z.string().trim().max(40).optional().nullable(),
  bankIfsc: z.string().trim().max(20).optional().nullable(),
  defaultTermsTemplateId: z.string().uuid().nullable().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
