import type { Page, Response } from 'playwright';
import { NonRetryableError } from '../base/scraper.interface.js';

/** Blocked and incomplete pages must never masquerade as zero search matches. */
export async function assertPageAccessible(page: Page, response: Response | null): Promise<void> {
  const status = response?.status();
  if (status !== undefined && status >= 400) {
    throw new NonRetryableError(
      `OLX returned HTTP ${status}; the page is unavailable or access is restricted`
    );
  }
  const title = await page.title();
  if (/human verification|access denied|just a moment|captcha|robot check/i.test(title)) {
    throw new NonRetryableError(
      'OLX returned a verification page; automated access is unavailable'
    );
  }
}
