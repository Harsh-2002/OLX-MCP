import { OLX_DOMAINS, LOCATION_DOMAINS, type LocationDomain } from '../../core/domains.js';
import { LocationService } from '../../locations/location-service.js';
import { canonicalLocationValue } from '../../locations/location-parser.js';
import { resolveOlxIndiaLocation } from '../../scrapers/olx/olx-india-locations.js';
import { BaseTool } from '../base/base-tool.js';
import {
  SearchListingsArgsSchema,
  SearchListingsArgs,
} from '../../validation/schemas/listing.schema.js';
import { SearchResult, SearchFilters } from '../../core/types.js';
import { OlxScraperFactory } from '../../scrapers/olx/scraper.factory.js';

export class SearchListingsTool extends BaseTool<SearchListingsArgs, SearchResult> {
  readonly name = 'searchListings';
  readonly description = `Search for listings on OLX domains ${OLX_DOMAINS.join(', ')} with query, category, location, and price filters`;
  readonly inputSchema = SearchListingsArgsSchema;

  constructor(
    private readonly scraperFactory: OlxScraperFactory,
    private readonly locations?: LocationService
  ) {
    super();
  }

  protected async executeImpl(
    args: SearchListingsArgs,
    signal?: AbortSignal
  ): Promise<SearchResult> {
    let location = args.location;
    if (location && (LOCATION_DOMAINS as readonly string[]).includes(args.domain)) {
      const domain = args.domain as LocationDomain;
      let known = canonicalLocationValue(domain, location);
      if (domain === 'olx.in') {
        try {
          known = resolveOlxIndiaLocation(location);
        } catch {
          /* Resolve additional cities live below. */
        }
      }
      if (!known) {
        if (!this.locations) throw new Error('Use searchLocations to obtain a canonical location');
        const matches = (
          await this.locations.search({ domain, query: location, limit: 50 }, signal)
        ).locations;
        const exact = matches.filter(
          match => match.name.toLocaleLowerCase() === location!.toLocaleLowerCase()
        );
        const candidates = exact.length ? exact : matches;
        if (candidates.length !== 1)
          throw new Error(
            'Location is unknown or ambiguous. Use searchLocations and pass a canonical searchValue'
          );
        known = candidates[0]!.searchValue;
      }
      location = known;
    }
    const scraper = this.scraperFactory.getScraper(args.domain);

    const filters: SearchFilters = {
      domain: args.domain,
      query: args.query,
      category: args.category as any, // Will be properly typed when we have CategoryId conversion
      location: location as any, // Will be properly typed when we have LocationId conversion
      minPrice: args.minPrice,
      maxPrice: args.maxPrice,
      page: args.page,
      limit: args.limit,
      sortBy: args.sortBy,
    };

    const result = await scraper.scrape(filters, signal);

    if (!result.success) {
      throw result.error;
    }

    return result.data;
  }
}
