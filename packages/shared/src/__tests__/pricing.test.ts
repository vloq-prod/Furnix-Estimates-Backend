import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateEstimate } from '../pricing.engine';
import { formatPaise, toPaise } from '../money';
import type { ModulePriceInput, UserPricingInput } from '../pricing.types';

/** The full catalogue. Two taken, one deliberately left out. */
const catalogue: ModulePriceInput[] = [
  {
    moduleId: 'm1',
    moduleCode: 'PROJECT_MGMT',
    moduleName: 'Project Management',
    sequence: 1,
    cloudSetupFee: 75000,
    selfHostedSetupFee: 125000,
    isSelected: true,
  },
  {
    moduleId: 'm2',
    moduleCode: 'TRACK_TRACE',
    moduleName: 'Track & Trace',
    sequence: 2,
    cloudSetupFee: 60000,
    selfHostedSetupFee: 100000,
    isSelected: true,
  },
  {
    moduleId: 'm3',
    moduleCode: 'SCAN_PACK',
    moduleName: 'Scan & Pack',
    sequence: 3,
    cloudSetupFee: 40000,
    selfHostedSetupFee: 70000,
    isSelected: false,
  },
];

const userPricing: UserPricingInput = { monthlyPricePerUser: 800 };

test('modules charge one-time only; users charge monthly, on head count alone', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 25,
    gstPercent: 18,
    modules: catalogue,
    userPricing,
  });

  assert.equal(result.oneTimeSubtotal, toPaise(135000));
  assert.equal(result.recurringSubtotal, toPaise(25 * 800));
  assert.equal(result.userLine.lineMonthlyAmount, toPaise(20000));
  assert.equal(result.netPayableOneTime, toPaise(159300));
  assert.equal(result.monthlyRecurringPayable, toPaise(23600));
});

test('the recurring charge is independent of how many modules are taken', () => {
  const base = { hostingModel: 'VLOQ_CLOUD', userCount: 25, gstPercent: 18, userPricing } as const;

  const oneModule = calculateEstimate({
    ...base,
    modules: catalogue.map((m, i) => ({ ...m, isSelected: i === 0 })),
  });
  const allModules = calculateEstimate({
    ...base,
    modules: catalogue.map((m) => ({ ...m, isSelected: true })),
  });
  const noModules = calculateEstimate({
    ...base,
    modules: catalogue.map((m) => ({ ...m, isSelected: false })),
  });

  // Module selection moves the one-time bucket and nothing else.
  assert.equal(oneModule.oneTimeSubtotal, toPaise(75000));
  assert.equal(allModules.oneTimeSubtotal, toPaise(175000));
  assert.equal(noModules.oneTimeSubtotal, 0);

  const monthly = toPaise(20000);
  assert.equal(oneModule.recurringSubtotal, monthly);
  assert.equal(allModules.recurringSubtotal, monthly);
  // Platform access is still chargeable with zero modules taken.
  assert.equal(noModules.recurringSubtotal, monthly);
});

test('every catalogue module is returned, unselected ones priced at zero', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 10,
    gstPercent: 18,
    modules: catalogue,
    userPricing,
  });

  assert.equal(result.lines.length, 3);
  assert.equal(result.selectedLines.length, 2);

  const skipped = result.lines.find((line) => line.moduleCode === 'SCAN_PACK');
  assert.ok(skipped);
  assert.equal(skipped.isSelected, false);
  assert.equal(skipped.lineOneTimeAmount, 0);
  // The document still shows what it would have cost.
  assert.equal(skipped.applicableOneTimeFee, toPaise(40000));
});

test('client-owned server uses the higher fee and drops the user charge', () => {
  const result = calculateEstimate({
    hostingModel: 'CLIENT_OWNED',
    userCount: 25,
    gstPercent: 18,
    modules: catalogue,
    userPricing,
  });

  assert.equal(result.oneTimeSubtotal, toPaise(225000));
  assert.equal(result.recurringSubtotal, 0);
  assert.equal(result.userLine.appliedMonthlyPerUser, 0);
  assert.equal(result.monthlyRecurringPayable, 0);
  assert.equal(result.netPayableOneTime, toPaise(265500));
  // User count is still recorded for reference.
  assert.equal(result.userCount, 25);
  assert.equal(result.userLine.userCount, 25);
});

test('per-estimate module override leaves the master price snapshot intact', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 10,
    gstPercent: 18,
    modules: catalogue.map((m) =>
      m.moduleCode === 'PROJECT_MGMT' ? { ...m, overrideOneTimeFee: 50000 } : m,
    ),
    userPricing,
  });

  const line = result.lines.find((l) => l.moduleCode === 'PROJECT_MGMT');
  assert.ok(line);
  assert.equal(line.isOverridden, true);
  assert.equal(line.appliedOneTimeFee, toPaise(50000));
  assert.equal(line.cloudSetupFee, toPaise(75000));
  assert.equal(result.oneTimeSubtotal, toPaise(110000));
});

test('per-estimate user rate override applies to the user line only', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 20,
    gstPercent: 18,
    modules: catalogue,
    userPricing: { monthlyPricePerUser: 800, overrideMonthlyPerUser: 650 },
  });

  assert.equal(result.userLine.isOverridden, true);
  assert.equal(result.userLine.monthlyPricePerUser, toPaise(800));
  assert.equal(result.userLine.appliedMonthlyPerUser, toPaise(650));
  assert.equal(result.recurringSubtotal, toPaise(13000));
  assert.equal(result.oneTimeSubtotal, toPaise(135000));
});

test('percentage adjustment reduces the taxable base before GST', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 25,
    gstPercent: 18,
    modules: catalogue,
    userPricing,
    adjustment: { type: 'PERCENT', value: 10, scope: 'ONE_TIME' },
  });

  assert.equal(result.oneTimeAdjustment, toPaise(13500));
  assert.equal(result.taxableOneTime, toPaise(121500));
  assert.equal(result.gstOneTime, toPaise(21870));
  assert.equal(result.netPayableOneTime, toPaise(143370));
  // Recurring untouched by a one-time scoped adjustment.
  assert.equal(result.recurringAdjustment, 0);
});

test('fixed adjustment scoped to both splits proportionally and reconciles exactly', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 25,
    gstPercent: 18,
    modules: catalogue,
    userPricing,
    adjustment: { type: 'FIXED', value: 15000, scope: 'BOTH' },
  });

  assert.equal(result.oneTimeAdjustment + result.recurringAdjustment, toPaise(15000));
  assert.ok(result.oneTimeAdjustment > result.recurringAdjustment);
});

test('an adjustment can never drive a bucket negative', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 5,
    gstPercent: 18,
    modules: catalogue.map((m) => ({ ...m, isSelected: false })),
    userPricing,
    adjustment: { type: 'FIXED', value: 999999, scope: 'BOTH' },
  });

  assert.equal(result.taxableOneTime, 0);
  assert.equal(result.taxableRecurring, 0);
  assert.equal(result.netPayableOneTime, 0);
  assert.equal(result.monthlyRecurringPayable, 0);
});

test('GST is rounded half-up at paise precision, per bucket', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 3,
    gstPercent: 18,
    modules: [{ ...catalogue[0]!, cloudSetupFee: '1000.05', isSelected: true }],
    userPricing: { monthlyPricePerUser: '333.33' },
  });

  assert.equal(result.taxableOneTime, 100005);
  assert.equal(result.gstOneTime, 18001);
  assert.equal(result.taxableRecurring, 99999);
  assert.equal(result.gstRecurring, 18000);
});

test('the two payables are never merged into one figure', () => {
  const result = calculateEstimate({
    hostingModel: 'VLOQ_CLOUD',
    userCount: 25,
    gstPercent: 18,
    modules: catalogue,
    userPricing,
  });

  assert.notEqual(result.netPayableOneTime, result.monthlyRecurringPayable);
  assert.equal(
    result.firstYearIndicativeValue,
    result.taxableOneTime + result.taxableRecurring * 12,
  );
});

test('money formats in the Indian lakh convention', () => {
  assert.equal(formatPaise(toPaise(125000)), '₹1,25,000.00');
  assert.equal(formatPaise(toPaise(191012.5)), '₹1,91,012.50');
});