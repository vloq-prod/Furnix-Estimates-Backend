/**
 * Indian fiscal year: 1 April to 31 March.
 * 12 Aug 2026 -> "2026-27"  |  15 Feb 2026 -> "2025-26"
 */
export function getFiscalYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** "2026-27" -> "2627", used to keep estimate numbers compact. */
export function fiscalYearToken(fiscalYear: string): string {
  const [start = '', end = ''] = fiscalYear.split('-');
  return `${start.slice(-2)}${end}`;
}

export function formatEstimateNumber(prefix: string, fiscalYear: string, serial: number): string {
  return `${prefix}/${fiscalYearToken(fiscalYear)}/${String(serial).padStart(4, '0')}`;
}
