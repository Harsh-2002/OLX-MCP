import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BaseTool } from '../base/base-tool.js';
import { GetListingDetailsArgsSchema } from '../../validation/schemas/listing.schema.js';
import type { ListingId } from '../../core/types.js';
import { OperationCancelledError, PageGate } from '../../core/browser-pages.js';
import { ImageDownloader, type DownloadedImage } from '../../images/image-downloader.js';
import type { OlxScraperFactory } from '../../scrapers/olx/scraper.factory.js';

export const GetListingImagesArgsSchema = GetListingDetailsArgsSchema.pick({
  domain: true,
  listingId: true,
}).extend({
  limit: z.number().int().min(1).max(3).default(1),
});
type Args = z.infer<typeof GetListingImagesArgsSchema>;
export type ListingImages = {
  listingId: string;
  title: string;
  listingUrl: string;
  images: DownloadedImage[];
  warnings: string[];
};

export class GetListingImagesTool extends BaseTool<Args, ListingImages> {
  readonly name = 'getListingImages';
  readonly description =
    'Return actual listing photos as MCP image content for vision analysis, with source URLs for sharing. Search first and use a returned listingId. Downloads 1–3 JPEG, PNG, WebP or GIF photos; default 1, at most 2 MiB each. Availability depends on the listing and CDN.';
  readonly inputSchema = GetListingImagesArgsSchema;
  private readonly downloads = new PageGate(2, 16);

  constructor(
    private readonly factory: OlxScraperFactory,
    private readonly downloader = new ImageDownloader()
  ) {
    super();
  }

  protected async executeImpl(args: Args, signal?: AbortSignal): Promise<ListingImages> {
    const details = await this.factory
      .getScraper(args.domain)
      .getListingDetails(args.listingId as ListingId, signal, {
        includeImages: true,
        includeSellerInfo: false,
      });
    if (!details.success) throw details.error;
    const candidates = Array.from(
      new Set(
        [...(details.data.images ?? []), details.data.imageUrl].filter((url): url is string =>
          Boolean(url)
        )
      )
    ).slice(0, 6);
    if (!candidates.length) throw new Error('No listing photos were exposed by this page');
    const images: DownloadedImage[] = [];
    const warnings: string[] = [];
    for (const url of candidates) {
      if (images.length >= args.limit) break;
      const release = await this.downloads.acquire(signal);
      try {
        images.push(await this.downloader.download(url, signal));
      } catch (error) {
        if (signal?.aborted || error instanceof OperationCancelledError)
          throw new OperationCancelledError();
        warnings.push(error instanceof Error ? error.message : 'Photo download failed');
      } finally {
        release();
      }
    }
    if (!images.length)
      throw new Error(`No listing photos could be downloaded: ${warnings.join('; ')}`);
    return {
      listingId: args.listingId,
      title: details.data.title,
      listingUrl: details.data.url,
      images,
      warnings,
    };
  }

  toMcpResult(data: ListingImages): CallToolResult {
    const { images, ...metadata } = data;
    const structuredContent = {
      ...metadata,
      images: images.map(({ data: _bytes, ...image }) => image),
    };
    return {
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent),
        },
        ...images.map(image => ({
          type: 'image' as const,
          data: image.data,
          mimeType: image.mimeType,
        })),
      ],
    };
  }
}
