import type { Browser } from 'playwright';
import type { SearchFilters } from '../../core/types.js';
import { NonRetryableError } from '../base/scraper.interface.js';
import { BaseOlxScraper } from './base-olx.scraper.js';

/** Kazakhstan and Uzbekistan use native category paths, not the old category query parameter. */
export class OLXCentralAsiaScraper extends BaseOlxScraper {
  constructor(domain: 'olx.kz' | 'olx.uz', browser: Browser) {
    super(domain, browser);
  }

  protected override buildSearchUrl(filters: SearchFilters): string {
    const url = new URL(super.buildSearchUrl({ ...filters, category: undefined }));
    if (filters.category) {
      if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(filters.category)) {
        throw new NonRetryableError(
          'Category must be a native category path, such as elektronika/kompyutery/noutbuki'
        );
      }
      const queryPath = url.pathname.match(/\/q-[^/]+\/?$/)?.[0] ?? '/';
      const location = filters.location ? `/${encodeURIComponent(filters.location)}` : '';
      url.pathname = `/${filters.category}${location}${queryPath}`;
    }
    return url.toString();
  }

  protected override getNavigationWaitUntil(): 'domcontentloaded' {
    return 'domcontentloaded';
  }
}
