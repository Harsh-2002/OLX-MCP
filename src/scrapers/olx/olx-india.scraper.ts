import { Browser } from 'playwright';

import { ListingId } from '../../core/types.js';
import { BaseOlxScraper } from './base-olx.scraper.js';

/** OLX India uses /items search paths and iid-based listing URLs. */
export class OLXIndiaScraper extends BaseOlxScraper {
  constructor(browser: Browser) {
    super('olx.in', browser);
  }

  protected override extractListingId(url: string): ListingId {
    const match = url.match(/(?:^|[-/])iid-([A-Za-z0-9]+)(?:\.html)?(?:[/?#]|$)/i);
    if (match?.[1]) return match[1] as ListingId;

    return super.extractListingId(url);
  }

  protected override getListingIdSearchTerm(listingId: ListingId): string {
    return `iid-${listingId}`;
  }

  protected override getNavigationWaitUntil(): 'domcontentloaded' {
    return 'domcontentloaded';
  }

  protected override getSearchReadySelector(): string {
    const search = this.domainConfig.selectors.search;
    return `${search.listingCard}, ${search.totalCount}`;
  }

  protected override getDirectListingUrl(listingId: ListingId): string {
    return `${this.domainConfig.baseUrl}/item/${encodeURIComponent(listingId)}`;
  }

  protected override shouldWaitForImages(): boolean {
    return true;
  }
}
