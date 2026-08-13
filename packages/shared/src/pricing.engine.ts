import { AdjustmentScope, AdjustmentType, HostingModel } from './enums';
import { clamp, halfUp, percentOf, sum, toPaise } from './money';
import type {
  AdjustmentInput,
  ModulePriceInput,
  PricedLine,
  PricedUserLine,
  PricingInput,
  PricingResult,
  UserPricingInput,
} from './pricing.types';

export const DEFAULT_USER_LINE_LABEL = 'Platform users';

/**
 * The single source of truth for what an estimate costs.
 *
 * This function is pure: no dates, no randomness, no I/O, no database. The API
 * calls it before writing, and the browser calls it on every keystroke to render
 * the live ledger. Because both sides run the identical code, the number the
 * salesperson watches while typing is byte-for-byte the number that lands in
 * PostgreSQL and on the PDF.
 *
 * Two charges, priced independently:
 *
 *   Modules      one-time setup, per selected module
 *   Platform users   monthly, purely a function of head count
 *
 * The two never cross. Adding a module does not change the per-user rate, and
 * changing the user count does not change any module fee. Every active module is
 * priced and returned whether or not it was selected, so the estimate document
 * can show the full catalogue with the unselected ones at zero.
 *
 * Calculation sequence (fixed, and asserted by the test suite):
 *   1. one-time module charges, selected modules only
 *   2. monthly user charges, where the hosting model has them
 *   3. internal price adjustment
 *   4. taxable amount
 *   5. GST
 *   6. net total
 */
export function calculateEstimate(input: PricingInput): PricingResult {
  const gstPercent = clamp(Number(input.gstPercent ?? 0), 0, 100);
  const isCloud = input.hostingModel === HostingModel.VLOQ_CLOUD;

  // ── 1. Price every module in the catalogue ────────────────────────────────
  const lines: PricedLine[] = [...input.modules]
    .sort((a, b) => a.sequence - b.sequence || a.moduleCode.localeCompare(b.moduleCode))
    .map((module) => priceModuleLine(module, isCloud));

  const sumUserCount = lines
    .filter((line) => line.isSelected)
    .reduce((acc, line) => acc + (line.userCount || 0), 0);

  const userCount = sumUserCount || Math.max(0, Math.trunc(input.userCount || 0));
  const oneTimeSubtotal = sum(lines.map((line) => line.lineOneTimeAmount));

  // ── 2. Price the user line, independent of the modules above ──────────────
  const userLine = priceUserLine(input.userPricing, isCloud, userCount);
  const recurringSubtotal = userLine.lineMonthlyAmount;

  // ── 3. Internal price adjustment ──────────────────────────────────────────
  const { oneTimeAdjustment, recurringAdjustment } = resolveAdjustment(
    input.adjustment,
    oneTimeSubtotal,
    recurringSubtotal,
  );

  // ── 4. Taxable amounts ────────────────────────────────────────────────────
  const taxableOneTime = Math.max(0, oneTimeSubtotal - oneTimeAdjustment);
  const taxableRecurring = Math.max(0, recurringSubtotal - recurringAdjustment);

  // ── 5. GST, computed per bucket so each invoice line taxes its own base ────
  const gstOneTime = percentOf(taxableOneTime, gstPercent);
  const gstRecurring = percentOf(taxableRecurring, gstPercent);

  // ── 6. Net totals, kept apart ─────────────────────────────────────────────
  const netPayableOneTime = taxableOneTime + gstOneTime;
  const monthlyRecurringPayable = taxableRecurring + gstRecurring;

  return {
    hostingModel: input.hostingModel,
    userCount,
    gstPercent,
    lines,
    selectedLines: lines.filter((line) => line.isSelected),
    userLine,
    oneTimeSubtotal,
    recurringSubtotal,
    oneTimeAdjustment,
    recurringAdjustment,
    taxableOneTime,
    taxableRecurring,
    taxableTotal: taxableOneTime + taxableRecurring,
    gstOneTime,
    gstRecurring,
    gstTotal: gstOneTime + gstRecurring,
    netPayableOneTime,
    monthlyRecurringPayable,
    firstYearIndicativeValue: taxableOneTime + taxableRecurring * 12,
  };
}

/**
 * Price one module.
 *
 * Unselected modules are still fully priced — `applicableOneTimeFee` carries what
 * the module would have cost — but charge nothing. That lets the document print
 * the whole catalogue with a zero against everything the client passed on,
 * without those zeros being mistaken for free modules.
 */
function priceModuleLine(module: ModulePriceInput, isCloud: boolean): PricedLine {
  const cloudSetupFee = toPaise(module.cloudSetupFee);
  const selfHostedSetupFee = toPaise(module.selfHostedSetupFee);

  // Client-owned servers carry the higher self-hosted fee.
  const baseOneTimeFee = isCloud ? cloudSetupFee : selfHostedSetupFee;

  const hasOverride = isPresent(module.overrideOneTimeFee);
  const applicableOneTimeFee = hasOverride
    ? toPaise(module.overrideOneTimeFee as number | string)
    : baseOneTimeFee;

  const appliedOneTimeFee = module.isSelected ? applicableOneTimeFee : 0;

  return {
    moduleId: module.moduleId,
    moduleCode: module.moduleCode,
    moduleName: module.moduleName,
    moduleDescription: module.moduleDescription ?? null,
    sequence: module.sequence,
    isSelected: module.isSelected,
    cloudSetupFee,
    selfHostedSetupFee,
    applicableOneTimeFee,
    appliedOneTimeFee,
    isOverridden: hasOverride && module.isSelected,
    lineOneTimeAmount: appliedOneTimeFee,
    userCount: module.userCount ?? 0,
  };
}

/**
 * Price platform access.
 *
 * A client-owned server carries no monthly charge — the client runs the
 * infrastructure — so the rate drops to zero while the head count stays on
 * record for the document.
 */
function priceUserLine(
  userPricing: UserPricingInput | undefined,
  isCloud: boolean,
  userCount: number,
): PricedUserLine {
  const monthlyPricePerUser = toPaise(userPricing?.monthlyPricePerUser ?? 0);
  const hasOverride = isPresent(userPricing?.overrideMonthlyPerUser);

  const configuredRate = hasOverride
    ? toPaise(userPricing?.overrideMonthlyPerUser as number | string)
    : monthlyPricePerUser;

  const appliedMonthlyPerUser = isCloud ? configuredRate : 0;

  return {
    label: userPricing?.label?.trim() || DEFAULT_USER_LINE_LABEL,
    userCount,
    monthlyPricePerUser,
    appliedMonthlyPerUser,
    isOverridden: hasOverride && isCloud,
    lineMonthlyAmount: appliedMonthlyPerUser * userCount,
  };
}

/**
 * Resolve the internal adjustment into per-bucket paise reductions.
 *
 * A FIXED amount scoped to BOTH is split across the two buckets in proportion
 * to their size, so a ₹50,000 concession on a ₹4L setup + ₹1L annualised
 * recurring deal does not silently wipe out the entire recurring line.
 * Every result is clamped to its own base: an adjustment can never create a
 * negative taxable amount or a credit.
 */
function resolveAdjustment(
  adjustment: AdjustmentInput | null | undefined,
  oneTimeSubtotal: number,
  recurringSubtotal: number,
): { oneTimeAdjustment: number; recurringAdjustment: number } {
  const none = { oneTimeAdjustment: 0, recurringAdjustment: 0 };
  if (!adjustment || adjustment.type === AdjustmentType.NONE) return none;

  const value = Number(adjustment.value ?? 0);
  if (!Number.isFinite(value) || value <= 0) return none;

  const touchesOneTime =
    adjustment.scope === AdjustmentScope.ONE_TIME || adjustment.scope === AdjustmentScope.BOTH;
  const touchesRecurring =
    adjustment.scope === AdjustmentScope.RECURRING || adjustment.scope === AdjustmentScope.BOTH;

  if (adjustment.type === AdjustmentType.PERCENT) {
    const percent = clamp(value, 0, 100);
    return {
      oneTimeAdjustment: touchesOneTime ? percentOf(oneTimeSubtotal, percent) : 0,
      recurringAdjustment: touchesRecurring ? percentOf(recurringSubtotal, percent) : 0,
    };
  }

  const requested = toPaise(value);
  const oneTimeBase = touchesOneTime ? oneTimeSubtotal : 0;
  const recurringBase = touchesRecurring ? recurringSubtotal : 0;
  const combinedBase = oneTimeBase + recurringBase;

  if (combinedBase <= 0) return none;

  const capped = Math.min(requested, combinedBase);

  if (!touchesRecurring) return { oneTimeAdjustment: capped, recurringAdjustment: 0 };
  if (!touchesOneTime) return { oneTimeAdjustment: 0, recurringAdjustment: capped };

  // Proportional split, with the remainder pushed onto the one-time bucket so
  // the two parts always add back up to exactly `capped`.
  const recurringShare = Math.min(halfUp(capped * recurringBase, combinedBase), recurringBase);
  return {
    oneTimeAdjustment: capped - recurringShare,
    recurringAdjustment: recurringShare,
  };
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && Number(value) >= 0;
}
