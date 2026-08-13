import type { AdjustmentScope, AdjustmentType, HostingModel } from './enums';

/**
 * Master prices for one module, as rupee strings/numbers straight from the DB.
 *
 * Modules are a one-time charge only. Per-user pricing is no longer attached to
 * a module — see {@link UserPricingInput}.
 */
export interface ModulePriceInput {
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
  sequence: number;
  cloudSetupFee: number | string;
  selfHostedSetupFee: number | string;
  /**
   * Whether the client has taken this module.
   *
   * Every active module is priced and returned, selected or not, so the estimate
   * document can list the full catalogue and show the client exactly what they
   * did and did not take. Unselected modules price to zero and contribute
   * nothing to any subtotal.
   */
  isSelected: boolean;
  /** Per-estimate override. Leaves the Module Master untouched. */
  overrideOneTimeFee?: number | string | null;
  userCount?: number;
}

/**
 * Platform user pricing — a standalone charge, independent of module selection.
 *
 * The client pays for platform access per user per month. Taking more modules
 * does not change this rate, and taking none does not remove it.
 */
export interface UserPricingInput {
  /** Configured rate from company settings, in rupees. */
  monthlyPricePerUser: number | string;
  /** Per-estimate override. Leaves the configured rate untouched. */
  overrideMonthlyPerUser?: number | string | null;
  /** Label for the line item on the estimate. */
  label?: string | null;
}

export interface AdjustmentInput {
  type: AdjustmentType;
  /** Rupees when type is FIXED, percent (0-100) when type is PERCENT. */
  value: number | string;
  scope: AdjustmentScope;
}

export interface PricingInput {
  hostingModel: HostingModel;
  userCount: number;
  gstPercent: number | string;
  /** Pass the full active catalogue, not just the selected subset. */
  modules: ModulePriceInput[];
  userPricing: UserPricingInput;
  adjustment?: AdjustmentInput | null;
}

/** One priced module line. All amounts are paise. */
export interface PricedLine {
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  moduleDescription: string | null;
  sequence: number;
  isSelected: boolean;
  /** Snapshot of master prices at the time of pricing. */
  cloudSetupFee: number;
  selfHostedSetupFee: number;
  /** What this module would cost under the chosen hosting model, selected or not. */
  applicableOneTimeFee: number;
  /** What actually got charged: zero unless selected. */
  appliedOneTimeFee: number;
  isOverridden: boolean;
  lineOneTimeAmount: number;
  userCount: number;
}

/** The platform user line. A single line item, priced on head count alone. */
export interface PricedUserLine {
  label: string;
  userCount: number;
  /** Configured rate, snapshotted. */
  monthlyPricePerUser: number;
  /** What actually got charged per user, after override and hosting model. */
  appliedMonthlyPerUser: number;
  isOverridden: boolean;
  /** userCount x appliedMonthlyPerUser. */
  lineMonthlyAmount: number;
}

/** Complete pricing result. Every amount is paise. */
export interface PricingResult {
  hostingModel: HostingModel;
  userCount: number;
  gstPercent: number;
  /** Every active module, selected or not, in display order. */
  lines: PricedLine[];
  /** Convenience view of the modules the client actually took. */
  selectedLines: PricedLine[];
  userLine: PricedUserLine;

  oneTimeSubtotal: number;
  recurringSubtotal: number;

  /** Internal only. Stripped before the payload reaches an unauthorised viewer. */
  oneTimeAdjustment: number;
  recurringAdjustment: number;

  taxableOneTime: number;
  taxableRecurring: number;
  taxableTotal: number;

  gstOneTime: number;
  gstRecurring: number;
  gstTotal: number;

  /** Payable now, once. */
  netPayableOneTime: number;
  /** Payable every month, ongoing. Deliberately never added to the above. */
  monthlyRecurringPayable: number;

  /** First-year cash view, for internal comparison only. Not a payment total. */
  firstYearIndicativeValue: number;
}
