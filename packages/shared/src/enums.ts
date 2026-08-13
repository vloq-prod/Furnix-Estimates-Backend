/**
 * Domain enums. These mirror the Prisma enums exactly (same member names)
 * so values can cross the API boundary without translation layers.
 */

export const HostingModel = {
  VLOQ_CLOUD: 'VLOQ_CLOUD',
  CLIENT_OWNED: 'CLIENT_OWNED',
} as const;
export type HostingModel = (typeof HostingModel)[keyof typeof HostingModel];

export const EstimateStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type EstimateStatus = (typeof EstimateStatus)[keyof typeof EstimateStatus];

/** Internal-only. Never rendered as a label on a client-facing document. */
export const AdjustmentType = {
  NONE: 'NONE',
  FIXED: 'FIXED',
  PERCENT: 'PERCENT',
} as const;
export type AdjustmentType = (typeof AdjustmentType)[keyof typeof AdjustmentType];

/**
 * Which subtotal the internal adjustment reduces. The brief only requires that
 * the adjustment reduce "the taxable subtotal"; an estimate has two independent
 * taxable subtotals (one-time and recurring), so the scope is explicit rather
 * than guessed. ONE_TIME is the default because setup fees are where commercial
 * negotiation normally happens.
 */
export const AdjustmentScope = {
  ONE_TIME: 'ONE_TIME',
  RECURRING: 'RECURRING',
  BOTH: 'BOTH',
} as const;
export type AdjustmentScope = (typeof AdjustmentScope)[keyof typeof AdjustmentScope];

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  SALES_MANAGER: 'SALES_MANAGER',
  SALES_EXECUTIVE: 'SALES_EXECUTIVE',
  VIEWER: 'VIEWER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ActivityAction = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SENT: 'SENT',
  DUPLICATED: 'DUPLICATED',
  PDF_GENERATED: 'PDF_GENERATED',
  ADJUSTMENT_CHANGED: 'ADJUSTMENT_CHANGED',
  DELETED: 'DELETED',
  RESTORED: 'RESTORED',
} as const;
export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

export const ESTIMATE_STATUS_FLOW: Record<EstimateStatus, EstimateStatus[]> = {
  DRAFT: ['SENT', 'REJECTED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: ['DRAFT'],
  EXPIRED: ['DRAFT', 'SENT'],
};

export function canTransition(from: EstimateStatus, to: EstimateStatus): boolean {
  if (from === to) return true;
  return ESTIMATE_STATUS_FLOW[from].includes(to);
}

/** An estimate is frozen once the client has acted on it. */
export function isEditable(status: EstimateStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED' || status === 'EXPIRED';
}
