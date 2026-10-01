import type { Browser } from 'playwright';
import type { ListingId, SearchFilters } from '../../core/types.js';
import { NonRetryableError } from '../base/scraper.interface.js';
import { BaseOlxScraper } from './base-olx.scraper.js';

/** Brazil has native category paths and numeric IDs, separate from OLX Europe. */
export class OLXBrazilScraper extends BaseOlxScraper {
  constructor(browser: Browser) {
    super('olx.com.br', browser);
  }

  protected override buildSearchUrl(filters: SearchFilters): string {
    if (filters.sortBy && filters.sortBy !== 'relevance') {
      throw new NonRetryableError(
        'Custom sorting on Brazil has not been verified and is not supported'
      );
    }
    const url = new URL(super.buildSearchUrl({ ...filters, category: undefined }));
    if (filters.category) {
      if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(filters.category)) {
        throw new NonRetryableError(
          'Brazil category must be a native path, such as informatica/notebooks'
        );
      }
      url.pathname = `${filters.location ? url.pathname : ''}/${filters.category}`;
    }
    if (filters.query) url.searchParams.set('q', filters.query);
    return url.toString();
  }

  protected override extractListingId(url: string): ListingId {
    const match = new URL(url, this.domainConfig.baseUrl).pathname.match(/-(\d{8,})\/?$/);
    return match?.[1] ? (match[1] as ListingId) : super.extractListingId(url);
  }

  protected override getNavigationWaitUntil(): 'domcontentloaded' {
    return 'domcontentloaded';
  }

  protected override async findListingUrl(): Promise<string> {
    throw new NonRetryableError(
      'Search Brazil first to cache the canonical URL for this listing ID'
    );
  }
}
