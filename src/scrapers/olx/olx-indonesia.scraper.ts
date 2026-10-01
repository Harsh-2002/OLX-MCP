import type { Browser } from 'playwright';
import type { ListingId, SearchFilters } from '../../core/types.js';
import { NonRetryableError } from '../base/scraper.interface.js';
import { LoadMoreOlxScraper } from './load-more-olx.scraper.js';

/** Indonesia uses iid URLs and load-more navigation rather than European paging. */
export class OLXIndonesiaScraper extends LoadMoreOlxScraper {
  constructor(browser: Browser) {
    super('olx.co.id', browser);
  }

  protected override buildSearchUrl(filters: SearchFilters): string {
    if (
      filters.category ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      (filters.sortBy && filters.sortBy !== 'relevance')
    ) {
      throw new NonRetryableError(
        'Indonesia currently supports query, canonical location, and limit; other filters are not verified'
      );
    }
    return super.buildSearchUrl(filters);
  }

  protected override extractListingId(url: string): ListingId {
    const match = url.match(/-iid-([A-Za-z0-9]+)(?:[/?#]|$)/);
    return match?.[1] ? (match[1] as ListingId) : super.extractListingId(url);
  }

  protected override getNavigationWaitUntil(): 'domcontentloaded' {
    return 'domcontentloaded';
  }

  protected override async findListingUrl(): Promise<string> {
    throw new NonRetryableError(
      'Search Indonesia first to cache the canonical URL for this listing ID'
    );
  }
}
