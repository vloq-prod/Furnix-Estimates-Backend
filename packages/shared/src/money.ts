/**
 * Money handling.
 *
 * Every intermediate calculation in this codebase happens in **paise as a
 * JS integer**. Floating point rupees (1725.0000000000002) are the single most
 * common source of "the PDF total does not match the database total" bugs, and
 * they are unfixable after the fact. Number.MAX_SAFE_INTEGER is ~9e15 paise,
 * i.e. ~90,000 crore rupees, which is comfortably beyond any estimate we issue.
 *
 * Rupee values only exist at two boundaries: input parsing and display.
 */

export type Paise = number;

const PAISE_PER_RUPEE = 100;

/** Parse a rupee value (number, numeric string, or Prisma Decimal) into paise. */
export function toPaise(value: number | string | { toString(): string }): Paise {
  const raw = typeof value === 'number' ? value.toFixed(6) : String(value).trim();
  if (raw === '' || raw === 'null' || raw === 'undefined') return 0;

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new TypeError(`Cannot parse "${raw}" as a monetary amount`);
  }

  const paddedFraction = (fraction + '00').slice(0, 3); // keep 1 extra digit to round on
  const scaled = Number(whole) * 1000 + Number(paddedFraction || '0');
  const rounded = halfUp(scaled, 10);

  return negative ? -rounded : rounded;
}

/** Convert paise back to a rupee number with exactly 2 decimals. */
export function toRupees(paise: Paise): number {
  return Math.round(paise) / PAISE_PER_RUPEE;
}

/** Convert paise to the fixed-precision string Prisma expects for Decimal(14,2). */
export function toDecimalString(paise: Paise): string {
  const rounded = Math.round(paise);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const body = `${Math.floor(abs / PAISE_PER_RUPEE)}.${String(abs % PAISE_PER_RUPEE).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/** Round-half-up away from zero. Banker's rounding surprises accountants. */
export function halfUp(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator) || 1;
  const quotient = Math.abs(numerator) / Math.abs(denominator);
  return sign * Math.round(quotient + Number.EPSILON);
}

/** Apply a percentage (e.g. 18, 7.5) to a paise amount, rounded half-up. */
export function percentOf(paise: Paise, percent: number): Paise {
  return halfUp(paise * Math.round(percent * 10000), 10000 * 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format paise as Indian currency: 12500000 -> "₹1,25,000.00" */
export function formatPaise(paise: Paise): string {
  return INR.format(toRupees(paise));
}

/** Format a rupee number as Indian currency. */
export function formatRupees(rupees: number | string): string {
  return INR.format(typeof rupees === 'string' ? Number(rupees) : rupees);
}

/** Digits-and-separators only, for right-aligned table cells that carry their own ₹ header. */
export function formatPaiseCompactNumber(paise: Paise): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toRupees(paise));
}
