import { BaseTool } from '../base/base-tool.js';
import {
  GetListingDetailsArgsSchema,
  GetListingDetailsArgs,
} from '../../validation/schemas/listing.schema.js';
import { Listing, ListingId } from '../../core/types.js';
import { OlxScraperFactory } from '../../scrapers/olx/scraper.factory.js';

export class GetListingDetailsTool extends BaseTool<GetListingDetailsArgs, Listing> {
  readonly name = 'getListingDetails';
  readonly description =
    'Get detailed information about a specific OLX listing from any supported domain (olx.pt, olx.pl, olx.bg, olx.ro, olx.ua) including description, seller info, and images';
  readonly inputSchema = GetListingDetailsArgsSchema;

  constructor(private readonly scraperFactory: OlxScraperFactory) {
    super();
  }

  protected async executeImpl(args: GetListingDetailsArgs, signal?: AbortSignal): Promise<Listing> {
    const scraper = this.scraperFactory.getScraper(args.domain);
    const listingId = args.listingId as ListingId;

    const result = await scraper.getListingDetails(listingId, signal);

    if (!result.success) {
      throw result.error;
    }

    if (args.includeImages) {
      return result.data;
    }

    // Callers that opted out of image URLs get neither the gallery nor the
    // thumbnail taken from it.
    const { images: _images, imageUrl: _imageUrl, ...withoutImages } = result.data;
    return withoutImages;
  }
}
