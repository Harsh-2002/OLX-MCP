import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { Browser } from 'playwright';

import { OLXIndiaScraper } from './olx-india.scraper.js';
import {
  createPlaywrightMocks,
  resetPlaywrightMocks,
  setupOLXScrapingMocks,
  verifyPlaywrightCalls,
} from '../../../tests/mocks/playwright.mock.js';
import { assertIsSuccess } from '../../../tests/utils/test-helpers.js';
import type { ListingId, SearchFilters } from '../../core/types.js';

describe('OLXIndiaScraper', () => {
  let scraper: OLXIndiaScraper;
  let mockBrowser: Browser;

  beforeEach(() => {
    resetPlaywrightMocks();
    const mocks = createPlaywrightMocks();
    mockBrowser = mocks.browser;
    scraper = new OLXIndiaScraper(mockBrowser);
  });

  afterEach(() => {
    resetPlaywrightMocks();
  });

  it('uses the India domain configuration', () => {
    const config = (scraper as any).domainConfig;

    expect(config.domain).toBe('olx.in');
    expect(config.baseUrl).toBe('https://www.olx.in');
    expect(config.currency).toBe('INR');
    expect(config.language).toBe('en');
  });

  it('builds a location-scoped India search URL with the canonical city slug', async () => {
    setupOLXScrapingMocks();
    const filters: SearchFilters = {
      domain: 'olx.in',
      query: 'iphone 15',
      location: 'Bengaluru' as any,
      page: 2,
      limit: 20,
      sortBy: 'relevance',
    };

    const result = await scraper.scrape(filters);

    assertIsSuccess(result);
    const [gotoCall] = verifyPlaywrightCalls().gotoCalledWith;
    const url = gotoCall![0] as string;

    expect(url).toContain('https://www.olx.in/bengaluru_g4058803/items/q-iphone-15/');
    expect(url).toContain('page=2');
  });

  it('uses the India all-listings path when no city is supplied', async () => {
    setupOLXScrapingMocks();
    const filters: SearchFilters = {
      domain: 'olx.in',
      query: 'laptop',
    };

    const result = await scraper.scrape(filters);

    assertIsSuccess(result);
    const [gotoCall] = verifyPlaywrightCalls().gotoCalledWith;
    expect(gotoCall![0]).toContain('https://www.olx.in/items/q-laptop/');
  });

  it('extracts IDs from India iid listing URLs', () => {
    const extractListingId = (scraper as any).extractListingId.bind(scraper);

    expect(extractListingId('/item/mobile-phones-c1453-used-iphone-iid-1852255700')).toBe(
      '1852255700'
    );
    expect(extractListingId('/item/mobile-phones-c1453-used-iphone-iid-1852255700?foo=bar')).toBe(
      '1852255700'
    );
  });

  it('searches for iid markers when resolving an uncached listing ID', async () => {
    const { mockPage } = setupOLXScrapingMocks();
    const listingId = '1852255700' as ListingId;
    const previousImplementation = mockPage.$$eval.getMockImplementation();

    mockPage.$$eval.mockImplementation(
      (selector: string, pageFunction?: unknown, arg?: unknown) => {
        if (
          selector.includes('[data-cy="l-card"]') &&
          selector.includes('a[href]') &&
          arg === `iid-${listingId}`
        ) {
          return Promise.resolve('/item/mobile-phones-c1453-used-iphone-iid-1852255700');
        }

        return previousImplementation?.(selector, pageFunction, arg) ?? Promise.resolve([]);
      }
    );

    const result = await scraper.getListingDetails(listingId);

    assertIsSuccess(result);
    const calls = verifyPlaywrightCalls();
    expect(calls.gotoCalledWith[0]![0]).toBe('https://www.olx.in/items/q-1852255700/');
    expect(calls.gotoCalledWith[1]![0]).toBe(
      'https://www.olx.in/item/mobile-phones-c1453-used-iphone-iid-1852255700'
    );
    expect(mockPage.$$eval).toHaveBeenCalledWith(
      expect.stringContaining('[data-cy="l-card"]'),
      expect.any(Function),
      'iid-1852255700'
    );
  });
});
