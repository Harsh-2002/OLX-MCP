import { z } from 'zod';
import { LOCATION_DOMAINS } from '../../core/domains.js';
import type { LocationMatch, LocationQuery } from '../../locations/types.js';
import { LocationService } from '../../locations/location-service.js';
import { BaseTool } from '../base/base-tool.js';

export const SearchLocationsArgsSchema = z.object({
  domain: z.enum(LOCATION_DOMAINS),
  query: z.string().trim().min(1).max(100),
  parentId: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export class SearchLocationsTool extends BaseTool<LocationQuery, { locations: LocationMatch[] }> {
  readonly name = 'searchLocations';
  readonly description =
    'Look up live OLX locations in India, Brazil, Indonesia, Kazakhstan, or Uzbekistan. Pass a returned searchValue to searchListings.location. Live availability and directory coverage vary by country.';
  readonly inputSchema = SearchLocationsArgsSchema;
  constructor(private readonly service: LocationService) {
    super();
  }
  protected executeImpl(args: LocationQuery, signal?: AbortSignal) {
    return this.service.search(args, signal);
  }
}
