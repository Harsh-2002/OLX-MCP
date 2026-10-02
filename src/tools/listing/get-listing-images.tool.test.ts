import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallToolResultSchema } from '@modelcontextprotocol/core';
import { GetListingImagesTool } from './get-listing-images.tool.js';
import type { OlxScraperFactory } from '../../scrapers/olx/scraper.factory.js';
import type { ImageDownloader } from '../../images/image-downloader.js';
import { OperationCancelledError } from '../../core/browser-pages.js';

const detail = vi.fn();
const download = vi.fn();
const photo = {
  url: 'https://apollo.olx.in/a.jpg',
  mimeType: 'image/jpeg',
  data: '/9j/',
  byteLength: 3,
};
const listing = {
  id: '123',
  title: 'Fixture',
  url: 'https://www.olx.in/item/iid-123',
  images: [photo.url, 'https://apollo.olx.in/b.jpg'],
  imageUrl: photo.url,
};
let tool: GetListingImagesTool;
beforeEach(() => {
  detail.mockResolvedValue({ success: true, data: listing });
  download.mockResolvedValue(photo);
  tool = new GetListingImagesTool(
    { getScraper: () => ({ getListingDetails: detail }) } as unknown as OlxScraperFactory,
    { download } as unknown as ImageDownloader
  );
});

describe('listing photos for vision clients', () => {
  it('defaults to one photo and avoids unrelated seller extraction', async () => {
    const result = await tool.execute({ domain: 'olx.in', listingId: '123' } as any);
    expect(result.success).toBe(true);
    expect(detail).toHaveBeenCalledWith('123', undefined, {
      includeImages: true,
      includeSellerInfo: false,
    });
    expect(download).toHaveBeenCalledOnce();
    if (!result.success) throw result.error;
    const response = CallToolResultSchema.parse(tool.toMcpResult(result.data));
    expect(response.content[1]).toEqual({
      type: 'image',
      data: photo.data,
      mimeType: 'image/jpeg',
    });
    const text = JSON.parse((response.content[0] as any).text);
    expect(text.images[0]).toEqual({ url: photo.url, mimeType: photo.mimeType, byteLength: 3 });
    expect(text.images[0]).not.toHaveProperty('data');
    expect(text.listingUrl).toBe(listing.url);
  });
  it('deduplicates URLs and respects the requested photo count', async () => {
    const result = await tool.execute({ domain: 'olx.in', listingId: '123', limit: 3 });
    expect(result.success).toBe(true);
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('returns available photos with an explicit partial-failure warning', async () => {
    download.mockRejectedValueOnce(new Error('oversized'));
    const result = await tool.execute({ domain: 'olx.in', listingId: '123', limit: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images).toHaveLength(1);
      expect(result.data.warnings).toEqual(['oversized']);
    }
  });
  it('fails honestly when no images download', async () => {
    download.mockRejectedValue(new Error('blocked'));
    const result = await tool.execute({ domain: 'olx.in', listingId: '123', limit: 1 });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.message).toContain('No listing photos could be downloaded');
  });
  it('reports absent photos and scrape errors without downloading', async () => {
    detail.mockResolvedValueOnce({
      success: true,
      data: { ...listing, images: undefined, imageUrl: undefined },
    });
    let result = await tool.execute({ domain: 'olx.in', listingId: '123', limit: 1 });
    expect(result.success).toBe(false);
    detail.mockResolvedValueOnce({ success: false, error: new Error('scrape') });
    result = await tool.execute({ domain: 'olx.in', listingId: '123', limit: 1 });
    expect(result.success).toBe(false);
    expect(download).not.toHaveBeenCalled();
  });
  it('stops photo attempts on cancellation', async () => {
    download.mockRejectedValue(new OperationCancelledError());
    const result = await tool.execute({ domain: 'olx.in', listingId: '123', limit: 3 });
    expect(result.success).toBe(false);
    expect(download).toHaveBeenCalledOnce();
  });
  it.each([
    { limit: 0 },
    { limit: 4 },
    { limit: 1.5 },
    { domain: 'olx.com.br' },
    { listingId: '../private' },
  ])('validates at the boundary %j', async extra => {
    const result = await tool.execute({
      domain: 'olx.in',
      listingId: '123',
      limit: 1,
      ...extra,
    } as any);
    expect(result.success).toBe(false);
    expect(detail).not.toHaveBeenCalled();
  });
});
