import type { Browser, Page } from 'playwright';
import type { Listing, SearchFilters, OlxDomain } from '../../core/types.js';
import { NonRetryableError } from '../base/scraper.interface.js';
import { BaseOlxScraper } from './base-olx.scraper.js';

/** Native load-more sites require loading preceding batches before selecting a page. */
export class LoadMoreOlxScraper extends BaseOlxScraper {
  private readonly offsets = new WeakMap<Page, number>();
  constructor(domain: OlxDomain, browser: Browser) {
    super(domain, browser);
  }

  protected override buildSearchUrl(filters: SearchFilters): string {
    if ((filters.page ?? 1) > 10)
      throw new NonRetryableError('Load-more pagination is limited to 10 batches per call');
    return super.buildSearchUrl({ ...filters, page: 1 });
  }

  protected override async prepareSearchPage(page: Page, filters: SearchFilters): Promise<void> {
    const selector = this.domainConfig.selectors.search.listingCard;
    const cards = page.locator(selector);
    let offset = 0;
    for (let batch = 1; batch < (filters.page ?? 1); batch++) {
      offset = await cards.count();
      const more = page.getByRole('button', {
        name: new RegExp(this.domainConfig.loadMoreButtonName!, 'i'),
      });
      if (!(await more.count()) || !(await more.isVisible())) break;
      await more.click();
      const waitForMore = () =>
        page.waitForFunction(
          ({ selector, count }) => document.querySelectorAll(selector).length > count,
          { selector, count: offset },
          { timeout: 10000 }
        );
      try {
        await waitForMore();
      } catch (error) {
        // Server-rendered controls can accept a click before hydration installs handlers.
        if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
        if ((await cards.count()) <= offset) {
          await more.click();
          await waitForMore();
        }
      }
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
    const more = page.getByRole('button', {
      name: new RegExp(this.domainConfig.loadMoreButtonName!, 'i'),
    });
    const hasNextPage = Boolean((await more.count()) && (await more.isVisible()));
    return {
      ...info,
      hasNextPage,
      totalPages: Math.max(info.totalPages, currentPage + (hasNextPage ? 1 : 0)),
    };
  }
}
