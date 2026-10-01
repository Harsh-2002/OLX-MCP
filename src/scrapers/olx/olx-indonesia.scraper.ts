import type { Browser, Page } from 'playwright';
import type { ListingId, SearchFilters, Listing } from '../../core/types.js';
import { NonRetryableError } from '../base/scraper.interface.js';
import { BaseOlxScraper } from './base-olx.scraper.js';

/** Indonesia uses iid URLs and load-more navigation rather than European paging. */
export class OLXIndonesiaScraper extends BaseOlxScraper {
  private readonly offsets = new WeakMap<Page, number>();
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
    if ((filters.page ?? 1) > 10)
      throw new NonRetryableError(
        'Indonesia load-more pagination is limited to 10 batches per call'
      );
    return super.buildSearchUrl({ ...filters, page: 1 });
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

  protected override async prepareSearchPage(page: Page, filters: SearchFilters): Promise<void> {
    const selector = this.domainConfig.selectors.search.listingCard;
    const cards = page.locator(selector);
    let offset = 0;
    for (let batch = 1; batch < (filters.page ?? 1); batch++) {
      offset = await cards.count();
      const more = page.getByRole('button', { name: /muat lainnya/i });
      if (!(await more.count()) || !(await more.isVisible())) break;
      await more.click();
      await page.waitForFunction(
        ({ selector, count }) => document.querySelectorAll(selector).length > count,
        { selector, count: offset },
        { timeout: 10000 }
      );
    }
    this.offsets.set(page, offset);
  }

  protected override async isKnownEmptyPage(page: Page, filters: SearchFilters): Promise<boolean> {
    return (this.offsets.get(page) ?? 0) > 0 || super.isKnownEmptyPage(page, filters);
  }

  protected override async extractListings(
    page: Page,
    limit?: number
  ): Promise<{ listings: Listing[]; cardCount: number }> {
    return super.extractListings(page, limit, this.offsets.get(page) ?? 0);
  }

  protected override async extractPaginationInfo(
    page: Page,
    currentPage: number,
    cardCount: number
  ) {
    const info = await super.extractPaginationInfo(page, currentPage, cardCount);
    const more = page.getByRole('button', { name: /muat lainnya/i });
    const hasNextPage = Boolean((await more.count()) && (await more.isVisible()));
    return {
      ...info,
      hasNextPage,
      totalPages: Math.max(info.totalPages, currentPage + (hasNextPage ? 1 : 0)),
    };
  }
}
