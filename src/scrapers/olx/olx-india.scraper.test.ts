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
    expect(config.selectors.search.listingCard).toBe('li[data-aut-id^="itemBox"]');
    expect(config.selectors.detail.title).toBe('h1[data-aut-id="itemTitle"]');
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
    expect(url).not.toContain('page=');
    expect(gotoCall![1]).toMatchObject({ waitUntil: 'domcontentloaded' });
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

  it('extracts cards using the India data-aut-id selectors', async () => {
    const { mockPage } = setupOLXScrapingMocks();
    const previousCardImplementation = mockPage.$$eval.getMockImplementation();
    const previousCountImplementation = mockPage.$eval.getMockImplementation();

    mockPage.$$eval.mockImplementation(
      (selector: string, pageFunction?: unknown, arg?: unknown) => {
        if (selector.includes('li[data-aut-id^="itemBox"]')) {
          return Promise.resolve([
            {
              title: 'Sample Mini PC',
              price: '₹ 10,000',
              location: 'Example Area, Mumbai',
              imageUrl: 'https://example.com/mini-pc.webp',
              relativeUrl: '/item/sample-mini-pc-iid-1234567890',
            },
          ]);
        }

        return previousCardImplementation?.(selector, pageFunction, arg) ?? Promise.resolve([]);
      }
    );
    mockPage.$eval.mockImplementation((selector: string, pageFunction?: unknown) => {
      if (selector.includes('[data-aut-id="searchTextPage"] + span')) {
        return Promise.resolve(4);
      }

      return previousCountImplementation?.(selector, pageFunction) ?? Promise.resolve('');
    });

    const result = await scraper.scrape({
      domain: 'olx.in',
      query: 'mini pcs',
      location: 'Mumbai',
    });

    assertIsSuccess(result);
    expect(result.data.totalCount).toBe(4);
    expect(result.data.listings).toEqual([
      expect.objectContaining({
        id: '1234567890',
        title: 'Sample Mini PC',
        price: '₹ 10,000',
        location: 'Example Area, Mumbai',
        url: 'https://www.olx.in/item/sample-mini-pc-iid-1234567890',
      }),
    ]);
  });

  it('waits for delayed cards even when the result-count summary is already present', async () => {
    const { mockPage } = setupOLXScrapingMocks();
    let cardsReady = false;
    mockPage.waitForSelector.mockImplementation(async (selector: string) => {
      // The summary exists immediately; cards appear only when their selector is awaited.
      if (!selector.includes('searchTextPage')) cardsReady = true;
      return null;
    });
    mockPage.$eval.mockResolvedValue(4424);
    mockPage.$$eval.mockImplementation(async () =>
      cardsReady
        ? [
            {
              title: 'Delayed laptop',
              price: '₹ 20,000',
              relativeUrl: '/item/laptop-iid-123',
            },
          ]
        : []
    );

    const result = await scraper.scrape({ domain: 'olx.in', query: 'laptop' });

    assertIsSuccess(result);
    expect(result.data.listings[0]?.title).toBe('Delayed laptop');
    expect(mockPage.close).toHaveBeenCalledOnce();
  });

  it('reports a failure after the bounded wait if a positive count never produces cards', async () => {
    const { mockPage } = setupOLXScrapingMocks();
    mockPage.waitForSelector.mockRejectedValue(new Error('Selector timeout'));
    mockPage.$eval.mockResolvedValue(4424);
    mockPage.$$eval.mockResolvedValue([]);

    const result = await scraper.scrape({ domain: 'olx.in', query: 'laptop' });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.message).toContain('4424 results but no listing cards');
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('li[data-aut-id^="itemBox"]', {
      timeout: 10000,
      state: 'attached',
    });
    expect(mockPage.close).toHaveBeenCalledOnce();
  });

  it('extracts IDs from India iid listing URLs', () => {
    const extractListingId = (scraper as any).extractListingId.bind(scraper);

    expect(extractListingId('/item/sample-listing-iid-1234567890')).toBe('1234567890');
    expect(extractListingId('/item/sample-listing-iid-1234567890?foo=bar')).toBe('1234567890');
  });

  it("uses OLX India's direct numeric item route when resolving an uncached listing ID", async () => {
    const { mockPage } = setupOLXScrapingMocks();
    const listingId = '1234567890' as ListingId;

    const result = await scraper.getListingDetails(listingId);

    assertIsSuccess(result);
    const calls = verifyPlaywrightCalls();
    expect(calls.gotoCalledWith).toHaveLength(1);
    expect(calls.gotoCalledWith[0]![0]).toBe('https://www.olx.in/item/1234567890');
    expect(calls.gotoCalledWith[0]![1]).toMatchObject({ waitUntil: 'domcontentloaded' });
    expect(mockPage.$$eval).not.toHaveBeenCalledWith(
      expect.stringContaining('a[href]'),
      expect.any(Function),
      expect.anything()
    );
  });
});
