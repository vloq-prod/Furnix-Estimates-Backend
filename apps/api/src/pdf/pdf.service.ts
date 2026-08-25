import puppeteer, { type Browser } from 'puppeteer';
import type { UserRole } from '@furnix/shared';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { estimateService } from '../modules/estimates/estimate.service';
import { settingsService } from '../modules/settings/settings.service';
import { renderEstimateHtml } from './estimate.template';

/**
 * A single Chromium instance is launched lazily and reused across requests.
 * Launching per request costs ~700ms and leaks processes under load; a shared
 * browser with a fresh page per render is both faster and cleaner.
 */
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        ...(env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: env.PUPPETEER_EXECUTABLE_PATH } : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
        ],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

export const pdfService = {
  async renderEstimate(
    estimateId: string,
    actor: { id: string; role: UserRole },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [estimate, settings] = await Promise.all([
      estimateService.getById(estimateId),
      settingsService.get(),
    ]);

    // The template only ever receives client-facing figures. Internal pricing
    // never enters the render path at all.
    const html = renderEstimateHtml(estimate, settings);

    const browser = await getBrowser();
    const page = await browser.newPage();

    page.on('console', (msg) => console.log('Puppeteer page log:', msg.text()));
    page.on('pageerror', (err) => console.error('Puppeteer page error:', err));
    page.on('requestfailed', (req) =>
      console.error('Puppeteer request failed:', req.url(), req.failure()?.errorText),
    );

    try {
      await page.emulateMediaType('print');
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });

      // Wait for all images to load and decode completely before printing to PDF
      await page.evaluate(async () => {
        const doc = (globalThis as any).document;
        const images = Array.from(doc.querySelectorAll('img')) as any[];
        await Promise.all(
          images.map((img) => {
            if (img.complete) return img.decode().catch(() => {});
            return new Promise((resolve) => {
              img.onload = () => img.decode().then(resolve).catch(resolve);
              img.onerror = resolve;
            });
          }),
        );
      });

      const buffer = Buffer.from(
        await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: false,
          displayHeaderFooter: false,
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        }),
      );

      await prisma.estimateActivity.create({
        data: {
          estimateId,
          action: 'PDF_GENERATED',
          message: 'PDF generated',
          actorId: actor.id,
        },
      });

      return {
        buffer,
        filename: `${estimate.estimateNumber.replace(/[^\w.-]+/g, '-')}.pdf`,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  },

  async shutdown() {
    if (!browserPromise) return;
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close().catch(() => undefined);
  },
};

function escapeForTemplate(value: string): string {
  return value.replace(/[&<>]/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] ?? character,
  );
}
