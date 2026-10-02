import { z } from 'zod';
import { ListingSchema } from '../validation/schemas/listing.schema.js';

// MCP output is JSON: internal Date values become ISO strings at this boundary.
const wireListing = ListingSchema.omit({ publishedAt: true, seller: true }).extend({
  publishedAt: z.iso.datetime().optional(),
  seller: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      verified: z.boolean().optional(),
      memberSince: z.iso.datetime().optional(),
    })
    .optional(),
});

export const toolOutputSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  searchListings: z.object({
    listings: z.array(wireListing),
    totalCount: z.number().min(0),
    currentPage: z.number().int().min(1),
    totalPages: z.number().min(1),
    hasNextPage: z.boolean(),
  }),
  getListingDetails: wireListing,
  searchLocations: z.object({
    locations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(['region', 'city', 'district', 'locality']),
        searchValue: z.string(),
        parentId: z.string().optional(),
        region: z.string().optional(),
      })
    ),
  }),
  getListingImages: z.object({
    listingId: z.string(),
    title: z.string(),
    listingUrl: z.url(),
    images: z
      .array(
        z.object({
          url: z.url(),
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
          byteLength: z
            .number()
            .int()
            .positive()
            .max(2 * 1024 * 1024),
        })
      )
      .min(1)
      .max(3),
    warnings: z.array(z.string()),
  }),
};

export const MCP_PROTOCOL_VERSION = '2026-07-28';
