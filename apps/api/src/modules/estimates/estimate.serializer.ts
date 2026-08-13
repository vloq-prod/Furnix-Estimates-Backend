import type { Prisma } from '@prisma/client';
import { Permission, type UserRole, can } from '@furnix/shared';

export const ESTIMATE_INCLUDE = {
  modules: { orderBy: { sequence: 'asc' } },
  clauses: { orderBy: { sequence: 'asc' } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EstimateInclude;

export type EstimateWithRelations = Prisma.EstimateGetPayload<{ include: typeof ESTIMATE_INCLUDE }>;

/**
 * Fields that describe the internal price adjustment. These leave the server
 * only when the caller holds estimate:adjustment:view. Redaction happens here,
 * in one place, rather than being remembered at each call site.
 */
const INTERNAL_FIELDS = [
  'internalAdjustmentType',
  'internalAdjustmentValue',
  'internalAdjustmentScope',
  'internalAdjustmentNote',
  'internalAdjustmentById',
  'internalAdjustmentAt',
  'oneTimeAdjustment',
  'recurringAdjustment',
] as const;

/**
 * The client-facing document shows the adjusted taxable amount directly. It never
 * shows the list subtotal, because the difference between the two is exactly the
 * adjustment. Withholding one and publishing the other would leak it by subtraction.
 */
const DERIVABLE_FIELDS = ['oneTimeSubtotal', 'recurringSubtotal'] as const;

/**
 * The user line is quoted to the client, so label, count, applied rate and
 * monthly amount all stay. The configured rate and the override value do not:
 * publishing both alongside the applied rate would expose the internal
 * concession on the recurring bucket by subtraction.
 */
const USER_RATE_INTERNAL_FIELDS = ['userRateSnapshot', 'userRateOverride'] as const;

export interface SerializeOptions {
  role: UserRole;
  /** True for the preview and PDF renderers, which produce client-facing output. */
  clientFacing?: boolean;
}

export function serializeEstimate(estimate: EstimateWithRelations, options: SerializeOptions) {
  const maySeeAdjustment = can(options.role, Permission.ADJUSTMENT_VIEW);
  const output: Record<string, unknown> = { ...estimate };

  if (!maySeeAdjustment || options.clientFacing) {
    for (const field of INTERNAL_FIELDS) delete output[field];
    for (const field of DERIVABLE_FIELDS) delete output[field];
    for (const field of USER_RATE_INTERNAL_FIELDS) delete output[field];

    // Line-level list prices are also a back door to the adjustment when the
    // estimate carries a single module, so drop the master snapshot too.
    output.modules = estimate.modules.map((line) => ({
      id: line.id,
      moduleId: line.moduleId,
      moduleCode: line.moduleCode,
      moduleName: line.moduleName,
      moduleDescription: line.moduleDescription,
      sequence: line.sequence,
      // Selection state and the applicable fee are client-facing by design: the
      // document lists the whole catalogue and marks what was taken. Neither
      // reveals anything about the adjustment, which only ever moves subtotals.
      isSelected: line.isSelected,
      applicableOneTimeFee: line.applicableOneTimeFee,
      appliedOneTimeFee: line.appliedOneTimeFee,
      lineOneTimeAmount: line.lineOneTimeAmount,
      userCount: line.userCount,
    }));

    delete output.pricingSnapshot;
  }

  output.canViewAdjustment = maySeeAdjustment && !options.clientFacing;
  output.hasAdjustment =
    maySeeAdjustment && !options.clientFacing
      ? estimate.internalAdjustmentType !== 'NONE'
      : undefined;

  return output;
}

/** List rows carry only what the dashboard table renders. */
export function serializeEstimateListRow(
  estimate: Prisma.EstimateGetPayload<{
    include: { createdBy: { select: { id: true; name: true; email: true } } };
  }>,
  role: UserRole,
) {
  const maySeeAdjustment = can(role, Permission.ADJUSTMENT_VIEW);
  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    estimateDate: estimate.estimateDate,
    validUntil: estimate.validUntil,
    status: estimate.status,
    clientCompanyName: estimate.clientCompanyName,
    contactPerson: estimate.contactPerson,
    email: estimate.email,
    mobile: estimate.mobile,
    hostingModel: estimate.hostingModel,
    userCount: estimate.userCount,
    netPayableOneTime: estimate.netPayableOneTime,
    monthlyRecurringPayable: estimate.monthlyRecurringPayable,
    version: estimate.version,
    createdBy: estimate.createdBy,
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
    deletedAt: estimate.deletedAt,
    ...(maySeeAdjustment ? { hasAdjustment: estimate.internalAdjustmentType !== 'NONE' } : {}),
  };
}
