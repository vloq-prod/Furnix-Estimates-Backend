import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CompanySetting } from '@prisma/client';
import { formatPaise, toPaise } from '@furnix/shared';
import type { EstimateWithRelations } from '../modules/estimates/estimate.serializer';

/**
 * Inter font files, inlined as base64 data URIs.
 *
 * Inlining the fonts ensures the PDF generation is 100% self-contained across
 * local and production environments, without relying on OS-level fonts or external CDNs.
 * The Inter font family natively supports Latin and currency symbols including the Indian Rupee symbol (₹).
 */
let cachedInterCss: string | null = null;

function resolveFontPath(filename: string): string {
  const candidates = [
    path.join(__dirname, 'assets', 'fonts', filename),
    path.join(__dirname, 'pdf', 'assets', 'fonts', filename),
    path.join(__dirname, '..', 'assets', 'fonts', filename),
    path.join(__dirname, '..', 'pdf', 'assets', 'fonts', filename),
    path.join(process.cwd(), 'src', 'pdf', 'assets', 'fonts', filename),
    path.join(process.cwd(), 'dist', 'pdf', 'assets', 'fonts', filename),
    path.join(process.cwd(), 'apps', 'api', 'src', 'pdf', 'assets', 'fonts', filename),
    path.join(process.cwd(), 'apps', 'api', 'dist', 'pdf', 'assets', 'fonts', filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? '';
}

function interFontFacesCss(): string {
  if (cachedInterCss !== null) return cachedInterCss;
  try {
    const fontDefs = [
      { weight: 400, file: 'Inter-Regular.ttf' },
      { weight: 500, file: 'Inter-Medium.ttf' },
      { weight: 600, file: 'Inter-SemiBold.ttf' },
      { weight: 700, file: 'Inter-Bold.ttf' },
      { weight: 800, file: 'Inter-ExtraBold.ttf' },
    ];

    const rules = fontDefs.map(({ weight, file }) => {
      const fontPath = resolveFontPath(file);
      const base64 = readFileSync(fontPath).toString('base64');
      return `@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url('data:font/truetype;base64,${base64}') format('truetype');
}`;
    });

    cachedInterCss = rules.join('\n');
    return cachedInterCss;
  } catch (error) {
    console.error('Failed to load Inter font files:', error);
    return '';
  }
}

/**
 * The Furnix mark, inlined as a data URI.
 *
 * Puppeteer renders from a string with no base URL, so a relative <img src>
 * would silently resolve to nothing and print a broken-image box. Reading the
 * file once at module load and inlining it removes that failure mode entirely.
 * Falls back to an empty string if the asset is missing, so a bad deploy costs
 * you a logo rather than the whole document.
 */
let cachedBrandMark: string | null = null;

function brandMarkDataUri(): string {
  if (cachedBrandMark !== null) return cachedBrandMark;
  try {
    const file = path.join(__dirname, 'assets', 'furnix-mark.png');
    const data = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
    cachedBrandMark = data;
    return data;
  } catch {
    return '';
  }
}

let cachedSignature: string | null = null;

function signatureDataUri(): string {
  if (cachedSignature !== null) return cachedSignature;
  try {
    const file = path.join(__dirname, 'assets', 'vloq-signature.png');
    const data = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
    cachedSignature = data;
    return data;
  } catch {
    return '';
  }
}

const money = (value: unknown) => formatPaise(toPaise(String(value ?? 0)));

const longDate = (value: Date) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  );

/** Replace Unicode characters that the bundled Inter TTF lacks glyphs for. */
const normalizeUnicode = (value: string) =>
  value
    .replace(/[\u00AD]/g, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'st')
    .replace(/\uFB06/g, 'st');

const escape = (value: string | null | undefined) =>
  value
    ? normalizeUnicode(value)
        .replace(/[&<>"']/g, (character) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
        )
    : '';

const nl2br = (value: string | null | undefined) => escape(value).replace(/\n/g, '<br />');

/**
 * Client-facing estimate document.
 *
 * Two rules this template exists to enforce:
 *  1. The taxable amount is printed directly. There is no subtotal line and no
 *     deduction line, because those two together would reveal the internal
 *     adjustment by subtraction.
 *  2. One-time and monthly figures are settled in two separate payable blocks
 *     that are never summed.
 */
export function renderEstimateHtml(
  estimate: EstimateWithRelations,
  settings: CompanySetting,
): string {
  const isCloud = estimate.hostingModel === 'VLOQ_CLOUD';
  const hostingLabel = isCloud ? 'VLOQ Cloud Hosting' : 'Client-Owned Server';
  const hasRecurring = toPaise(String(estimate.taxableRecurring)) > 0;
  const hasPage2 = Boolean(estimate.notes || estimate.clauses.length > 0);

  const issuerAddress = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.city, settings.state, settings.postalCode].filter(Boolean).join(' '),
    settings.country,
  ]
    .filter(Boolean)
    .map((line) => escape(String(line)))
    .join('<br />');

  // Every active module is listed, taken or not, so the client can see the whole
  // catalogue and exactly what this estimate covers. Unselected modules show a
  // zero rather than being omitted, which removes any doubt about what was quoted.
  const sortedModules = [...estimate.modules].sort((a, b) => {
    if (a.isSelected && !b.isSelected) return -1;
    if (!a.isSelected && b.isSelected) return 1;
    return a.sequence - b.sequence;
  });

  const moduleRows = sortedModules
    .map(
      (line, index) => `
      <tr class="${line.isSelected ? 'is-included' : 'not-included'}">
        <td class="idx">${String(index + 1).padStart(2, '0')}</td>
        <td>
          <span class="mod-name">${escape(line.moduleName)}</span>
          ${line.moduleDescription ? `<span class="mod-desc">${escape(line.moduleDescription)}</span>` : ''}
          ${isCloud && line.isSelected && line.userCount ? `<span class="mod-desc" style="color:var(--gold);font-weight:550;margin-top:2px">${line.userCount} user${line.userCount === 1 ? '' : 's'}</span>` : ''}
        </td>
        <td class="mark">
          ${line.isSelected
          ? '<span class="pill yes">Included</span>'
          : '<span class="pill no">Not included</span>'
        }
        </td>
        <td class="num">${money(line.lineOneTimeAmount)}</td>
      </tr>`,
    )
    .join('');

  const includedCount = estimate.modules.filter((line) => line.isSelected).length;

  const clauses = estimate.clauses
    .map(
      (clause, index) => `
      <li class="clause">
        <span class="clause-no">${String(index + 1).padStart(2, '0')}</span>
        <div>
          <h4>${escape(clause.title)}</h4>
          <div class="clause-body">${normalizeUnicode(clause.contentHtml)}</div>
        </div>
      </li>`,
    )
    .join('');

  const signoffHtml = `
  <section class="signoff">
    <div class="sign">
      <span class="sign-eyebrow">For</span>
      <b>${escape(settings.legalName)}</b>
      <div class="sign-space">
        <img src="${signatureDataUri()}" class="signature-img" alt="Signature" />
      </div>
      <div class="sign-rule"></div>
      <span class="sign-role">Authorised signatory</span>
      <div class="sign-fields">
        <span>Name</span>
        <span>Date</span>
      </div>
    </div>

    <div class="sign accept">
      <span class="sign-eyebrow">Accepted for</span>
      <b>${escape(estimate.clientCompanyName)}</b>
      <div class="sign-space">
        <div class="seal-box"><span>Company seal</span></div>
      </div>
      <div class="sign-rule"></div>
      <span class="sign-role">Authorised signatory</span>
      <div class="sign-fields">
        <span>Name</span>
        <span>Date</span>
      </div>
    </div>
  </section>`;

  const colophonHtml = `
  <footer class="colophon">
    <span>${escape(estimate.estimateNumber)} · ${longDate(estimate.estimateDate)}</span>
    <span>This is an estimate, not a tax invoice.</span>
  </footer>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(estimate.estimateNumber)}</title>
<style>
  @page { size: A4; margin: 0; }

  ${interFontFacesCss()}

  /* ── Page containers — mirrors preview's min-h-[297mm] p-[12mm] flex flex-col justify-between ── */
  .page-1 {
    width: 210mm;
    height: 297mm;
    padding: 12mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page-2 {
    width: 210mm;
    min-height: 297mm;
    padding: 12mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-before: always;
    break-before: page;
  }

  :root {
    --ink:      #14110F;
    --ink-soft: #5A534C;
    --ink-mute: #8A8179;
    --rule:     #E3DDD3;
    --rule-bold:#14110F;
    --gold:     #B4893A;
    --gold-soft:#F5EBD8;
    --gold-deep:#8A6725;
    --line-soft:#F0ECE5;
    --paper:    #FFFFFF;
    --wash:     #FAF8F5;
  }

  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body, button, input, select, textarea, table, th, td, h1, h2, h3, h4, h5, h6 {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  body {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.55;
    color: var(--ink);
    background: var(--paper);
  }

  .num, .figure { font-variant-numeric: tabular-nums; }

  .eyebrow {
    font-size: 6.5pt;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
    font-weight: 600;
  }

  /* ── Masthead ─────────────────────────────────────────── */
  .masthead { display: flex; justify-content: space-between; align-items: flex-start;
              padding-bottom: 10px; border-bottom: 1.5pt solid var(--rule-bold); }
  .brand-mark { display: flex; align-items: center; gap: 9px; line-height: 1; }
  .brand-logo { width: 30px; height: 30px; border-radius: 7px; display: block; }
  .brand-word { font-size: 20pt; font-weight: 800; letter-spacing: -0.03em; }
  .brand-legal { margin-top: 5px; font-size: 7.5pt; color: var(--ink-soft); line-height: 1.45; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 15pt; font-weight: 700; letter-spacing: 0.08em;
                  text-transform: uppercase; }
  .doc-no { margin-top: 3px; font-size: 11pt; font-weight: 700; color: var(--gold); }
  .doc-dates { margin-top: 6px; font-size: 7.5pt; color: var(--ink-soft); }
  .doc-dates b { color: var(--ink); font-weight: 600; }

  /* ── Parties ──────────────────────────────────────────── */
  .parties { display: flex; gap: 0; margin-top: 10px; border: 0.75pt solid var(--rule); }
  .party { flex: 1; padding: 6px 12px; }
  .party + .party { border-left: 0.75pt solid var(--rule); }
  .party.facts { background: var(--wash); flex: 0 0 32%; }
  .party h3 { margin: 0 0 5px; font-size: 6.5pt; letter-spacing: 0.16em;
              text-transform: uppercase; color: var(--ink-mute); font-weight: 700; }
  .party .name { font-size: 10.5pt; font-weight: 700; letter-spacing: -0.01em; }
  .party .line { font-size: 8pt; color: var(--ink-soft); }
  .fact { display: flex; justify-content: space-between; gap: 8px; padding: 1.5px 0;
          font-size: 8pt; border-bottom: 0.5pt dotted var(--rule); }
  .fact:last-child { border-bottom: 0; }
  .fact dt { color: var(--ink-mute); }
  .fact dd { margin: 0; font-weight: 600; text-align: right; }

  /* ── Line items ───────────────────────────────────────── */
  .section-head { display: flex; align-items: baseline; gap: 10px; margin: 12px 0 5px; }
  .section-head h2 { margin: 0; font-size: 9pt; font-weight: 700; letter-spacing: 0.1em;
                     text-transform: uppercase; }
  .section-head .rule { flex: 1; height: 0.75pt; background: var(--rule); }

  table.lines { width: 100%; border-collapse: collapse; }
  table.lines thead th {
    font-size: 6.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-mute);
    font-weight: 700; text-align: left; padding: 0 8px 6px; border-bottom: 1pt solid var(--rule-bold);
  }
  table.lines thead th.num, table.lines td.num { text-align: right; }
  table.lines td { padding: 7px 8px; border-bottom: 0.5pt solid var(--rule); vertical-align: top; }
  table.lines td.idx { width: 22px; color: var(--ink-mute); font-size: 7.5pt; padding-top: 11px; }
  .mod-name { display: block; font-weight: 600; font-size: 9.5pt; }
  .mod-desc { display: block; font-size: 7.5pt; color: var(--ink-soft); margin-top: 1.5px;
              max-width: 120mm; }
  .na { color: var(--ink-mute); }

  /* Full catalogue: taken modules read normally, untaken ones recede but stay legible. */
  table.lines th.mark, table.lines td.mark { width: 95px; text-align: left; }
  table.lines tr.not-included td { color: var(--ink-mute); }
  table.lines tr.not-included .mod-name { font-weight: 500; }
  table.lines tr.is-included .mod-name { font-weight: 700; }
  table.lines tr.is-included td.num { font-weight: 700; }
  .pill { display: inline-block; padding: 1.5px 7px; border-radius: 100px;
          font-size: 6.5pt; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
          white-space: nowrap; }
  .pill.yes { background: var(--gold-soft); color: var(--gold-deep); }
  .pill.no  { background: var(--line-soft); color: var(--ink-mute); }
  table.lines tfoot td { border-top: 0.75pt solid var(--ink); border-bottom: 0;
                         padding-top: 8px; font-size: 8pt; }
  .foot-label { font-weight: 600; }
  .foot-total { font-weight: 800; }
  table.lines.users { margin-bottom: 4px; }

  /* ── Settlement ───────────────────────────────────────── */
  .settle {
    display: flex;
    gap: 10px;
    margin-top: 4px;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-before: avoid;
    break-before: avoid;
  }
  .settle-left { flex: 1; }
  .settle-card { border: 0.75pt solid var(--rule); background: var(--wash); }
  .settle-card > header { padding: 4px 11px; background: var(--wash);
                           border-bottom: 0.75pt solid var(--rule); font-size: 7pt;
                           letter-spacing: 0.12em; text-transform: uppercase;
                           font-weight: 700; color: var(--ink); }
  .settle-body { padding: 7px 11px; font-size: 8pt; color: var(--ink-soft); line-height: 1.45; }
  .settle-divider { border-top: 0.75pt solid var(--rule); margin: 9px 0 6px 0; }
  .bank-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .bank-table td { padding: 2.5px 0; border: 0; }
  .bank-table td.label { color: var(--ink-soft); text-align: left; }
  .bank-table td.value { font-weight: 600; text-align: right; color: var(--ink); }
  .bank-table td.value.mono { font-family: monospace; }
  .ledger { flex: 0 0 78mm; }
  .ledger-block { border: 0.75pt solid var(--rule); margin-bottom: 8px; }
  .ledger-block > header { padding: 4px 11px; background: var(--wash);
                           border-bottom: 0.75pt solid var(--rule); }
  .ledger-row { display: flex; justify-content: space-between; gap: 10px;
                padding: 2px 11px; font-size: 7.5pt; }
  .ledger-row .label { color: var(--ink-soft); }
  .ledger-row .value { font-weight: 600; }
  .ledger-total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
                  padding: 6px 11px; border-top: 1pt solid var(--rule-bold); background: #fff; }
  .ledger-total .label { font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase;
                         font-weight: 700; }
  .ledger-total .value { font-size: 11pt; font-weight: 800; letter-spacing: -0.02em; }
  .ledger-total.recurring .value { color: var(--gold); }
  .per-month { font-size: 7pt; color: var(--ink-mute); font-weight: 600; }
  .tax-note { text-transform: none; font-weight: normal; font-size: 7.5pt; color: var(--ink-soft); letter-spacing: normal; margin-left: 4px; }

  /* ── Terms ────────────────────────────────────────────── */
  .terms { margin-top: 20px; page-break-inside: auto; }
  .terms ol { list-style: none; margin: 0; padding: 0; }
  .clause { display: flex; gap: 10px; padding: 7px 0; border-bottom: 0.5pt solid var(--rule);
            page-break-inside: avoid; }
  .clause:last-child { border-bottom: 0; }
  .clause-no { flex: 0 0 18px; font-size: 7.5pt; font-weight: 700; color: var(--gold);
               padding-top: 1px; }
  .clause h4 { margin: 0 0 2px; font-size: 8.5pt; font-weight: 700; }
  .clause-body { font-size: 8pt; color: var(--ink-soft); }
  .clause-body p { margin: 0 0 3px; }
  .clause-body ul, .clause-body ol { margin: 3px 0; padding-left: 15px; }

  .notes { margin-top: 14px; font-size: 8pt; color: var(--ink-soft); }

  /* ── Sign-off ─────────────────────────────────────────── */
  .sign-eyebrow { display: block; font-size: 6.5pt; letter-spacing: 0.13em; text-transform: uppercase;
                  color: var(--ink-mute); margin-bottom: 2px; }
  /* Physical room to sign and stamp: ~24mm clears a signature and a round seal. */
  .sign-space { height: 24mm; position: relative; }
  .signature-img {
    position: absolute;
    bottom: 2px;
    left: 4px;
    height: 22mm;
    object-fit: contain;
    mix-blend-mode: multiply;
  }
  .seal-box { position: absolute; right: 0; top: 1mm; width: 26mm; height: 21mm;
              border: 0.6pt dashed var(--line); border-radius: 3px;
              display: flex; align-items: center; justify-content: center; }
  .seal-box span { font-size: 6pt; color: var(--ink-mute); letter-spacing: 0.06em;
                   text-transform: uppercase; }
  .sign-rule { border-top: 0.75pt solid var(--ink); }
  .sign-role { display: block; font-size: 7pt; color: var(--ink-soft); margin-top: 3px; }
  .sign-fields { display: flex; gap: 12px; margin-top: 9px; }
  .sign-fields span { flex: 1; font-size: 6.5pt; color: var(--ink-mute);
                      border-bottom: 0.5pt dotted var(--line); padding-bottom: 9px; }
  .signoff { display: flex; justify-content: space-between; margin-top: 16px;
             page-break-inside: avoid; }
  .sign { width: 74mm; page-break-inside: avoid; font-size: 7.5pt;
          color: var(--ink-soft); }
  .sign b { display: block; color: var(--ink); font-size: 8.5pt; }

  .colophon { margin-top: 16px; padding-top: 7px; border-top: 0.5pt solid var(--rule);
              font-size: 6.5pt; color: var(--ink-mute); display: flex;
              justify-content: space-between; }
  .page-break { page-break-before: always; break-before: page; }
</style>
</head>
<body>

  <div class="page-1">
    <!-- TOP: all main content -->
    <div>
      <header class="masthead">
        <div>
          <div class="brand-mark">
            <img src="${brandMarkDataUri()}" alt="" class="brand-logo" />
            <span class="brand-word">${escape(settings.brandName)}</span>
          </div>
          <div class="brand-legal">
            ${escape(settings.legalName)}<br />
            ${issuerAddress}
            ${settings.gstin ? `<br />GSTIN ${escape(settings.gstin)}` : ''}
            ${settings.email ? `<br />${escape(settings.email)}` : ''}
            ${settings.phone ? ` &nbsp;·&nbsp; ${escape(settings.phone)}` : ''}
          </div>
        </div>
        <div class="doc-title">
          <h1>Estimate</h1>
          <div class="doc-no figure">${escape(estimate.estimateNumber)}</div>
          <div class="doc-dates">
            Issued <b>${longDate(estimate.estimateDate)}</b><br />
            Valid until <b>${longDate(estimate.validUntil)}</b>
          </div>
        </div>
      </header>

      <section class="parties">
        <div class="party">
          <h3>Prepared for</h3>
          <div class="name">${escape(estimate.clientCompanyName)}</div>
          <div class="line">${escape(estimate.contactPerson)}</div>
          <div class="line">${nl2br(estimate.billingAddress)}</div>
          <div class="line">${[estimate.email, estimate.mobile].filter(Boolean).map(val => escape(val)).join(' &nbsp;·&nbsp; ')}</div>
          ${estimate.gstin ? `<div class="line">GSTIN ${escape(estimate.gstin)}</div>` : ''}
        </div>
        <div class="party facts">
          <h3>Engagement</h3>
          <dl style="margin:0">
            <div class="fact"><dt>Deployment</dt><dd>${hostingLabel}</dd></div>
            <div class="fact"><dt>Modules</dt><dd class="figure">${includedCount}</dd></div>
            <div class="fact"><dt>Users</dt><dd class="figure">${estimate.userCount}</dd></div>
          </dl>
        </div>
      </section>

      <div class="section-head">
        <h2>Modules &amp; Pricing</h2><div class="rule"></div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th></th>
            <th>Module</th>
            <th class="mark">Status</th>
            <th class="num">Setup (one-time)</th>
          </tr>
        </thead>
        <tbody>${moduleRows}</tbody>
        <tfoot>
          <tr>
            <td></td>
            <td class="foot-label">${includedCount} of ${estimate.modules.length} modules included</td>
            <td></td>
            <td class="num foot-total">${money(estimate.oneTimeSubtotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="section-head">
        <h2>Platform Users</h2><div class="rule"></div>
      </div>

      <table class="lines users">
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">Users</th>
            <th class="num">Rate / user / month</th>
            <th class="num">Monthly</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span class="mod-name">${escape(estimate.userLineLabel)}</span>
              <span class="mod-desc">Platform access charged per user per month. Independent of module selection.</span>
            </td>
            <td class="num">${estimate.userCount}</td>
            <td class="num">${isCloud ? money(estimate.appliedMonthlyPerUser) : '<span class="na">—</span>'}</td>
            <td class="num">${isCloud ? money(estimate.userLineMonthlyAmount) : '<span class="na">—</span>'}</td>
          </tr>
        </tbody>
      </table>

      <section class="settle">
        <div class="settle-left">
          <div class="settle-card">
            <header>How this is billed</header>
            <div class="settle-body">
              <p style="margin: 0 0 4px 0;">
                ${isCloud
                ? `Module setup is payable once, on acceptance. User charges are billed every month for ${estimate.userCount} user${estimate.userCount === 1 ? '' : 's'} and are not included in the one-time figure. Module selection does not affect the per-user rate. These are two separate settlements.`
                : `You provide and manage the server. The amount below is payable once, on acceptance. There is no monthly per-user charge on this deployment. The user count is recorded for sizing only.`
                }
              </p>
              ${settings.bankName ? `
              <div class="settle-divider"></div>
              <h4 style="margin: 0 0 5px 0; font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; color: var(--ink);">Bank Details</h4>
              <table class="bank-table">
                <tr><td class="label">Bank name</td><td class="value">${escape(settings.bankName)}</td></tr>
                <tr><td class="label">Account number</td><td class="value">${escape(settings.bankAccountNumber || '')}</td></tr>
                <tr><td class="label">IFSC code</td><td class="value mono">${escape(settings.bankIfsc || '')}</td></tr>
              </table>` : ''}
            </div>
          </div>
        </div>

        <div class="ledger">
          <div class="ledger-block">
            <header class="eyebrow">One-time charges</header>
            ${estimate.oneTimeSubtotal !== undefined ? `
            <div class="ledger-row"><span class="label">Total amount</span><span class="value num">${money(estimate.oneTimeSubtotal)}</span></div>` : ''}
            ${estimate.oneTimeSubtotal !== undefined && estimate.oneTimeAdjustment !== undefined && Number(estimate.oneTimeAdjustment) !== 0 ? `
            <div class="ledger-row" style="color: var(--ink-mute); font-style: italic;"><span class="label">Discount</span><span class="value num">−${money(estimate.oneTimeAdjustment)}</span></div>` : ''}
            <div class="ledger-row"><span class="label">Taxable amount</span><span class="value num">${money(estimate.taxableOneTime)}</span></div>
            ${Number(estimate.gstPercent) > 0 ? `
            <div class="ledger-row"><span class="label">GST (${Number(estimate.gstPercent)}%)</span><span class="value num">${money(estimate.gstOneTime)}</span></div>` : ''}
            <div class="ledger-total">
              <span class="label">Net payable <span class="tax-note">${Number(estimate.gstPercent) > 0 ? '(GST Included)' : '(GST Excluded)'}</span></span>
              <span class="value num">${money(estimate.netPayableOneTime)}</span>
            </div>
          </div>

          ${hasRecurring ? `<div class="ledger-block">
            <header class="eyebrow">Monthly recurring charges</header>
            ${estimate.recurringSubtotal !== undefined ? `
            <div class="ledger-row"><span class="label">Total amount</span><span class="value num">${money(estimate.recurringSubtotal)}</span></div>` : ''}
            ${estimate.recurringSubtotal !== undefined && estimate.recurringAdjustment !== undefined && Number(estimate.recurringAdjustment) !== 0 ? `
            <div class="ledger-row" style="color: var(--ink-mute); font-style: italic;"><span class="label">Discount</span><span class="value num">−${money(estimate.recurringAdjustment)}</span></div>` : ''}
            <div class="ledger-row"><span class="label">Taxable amount</span><span class="value num">${money(estimate.taxableRecurring)}</span></div>
            ${Number(estimate.gstPercent) > 0 ? `
            <div class="ledger-row"><span class="label">GST (${Number(estimate.gstPercent)}%)</span><span class="value num">${money(estimate.gstRecurring)}</span></div>` : ''}
            <div class="ledger-total recurring">
              <span class="label">Monthly payable <span class="tax-note">${Number(estimate.gstPercent) > 0 ? '(GST Included)' : '(GST Excluded)'}</span></span>
              <span class="value num">${money(estimate.monthlyRecurringPayable)}<span class="per-month">/mo</span></span>
            </div>
          </div>` : ''}
        </div>
      </section>
    </div>

    <!-- BOTTOM: footer (pushed to bottom by justify-content:space-between) -->
    <div>
      ${!hasPage2 ? signoffHtml : ''}
      ${colophonHtml}
    </div>
  </div>

  ${hasPage2 ? `
  <div class="page-2">
    <div>
      ${estimate.notes ? `<div class="notes" style="margin-top:0"><span class="eyebrow">Notes</span><br />${nl2br(estimate.notes)}</div>` : ''}
      ${estimate.clauses.length > 0 ? `
      <section class="terms" style="margin-top:14px">
        <div class="section-head"><h2>Terms &amp; Conditions</h2><div class="rule"></div></div>
        ${estimate.termsIntro ? `<div class="clause-body" style="margin-bottom:6px">${normalizeUnicode(estimate.termsIntro)}</div>` : ''}
        <ol>${clauses}</ol>
      </section>` : ''}
    </div>
    <div>
      ${signoffHtml}
      ${colophonHtml}
    </div>
  </div>` : ''}

</body>
</html>`;
}
