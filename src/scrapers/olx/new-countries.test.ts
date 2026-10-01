import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OlxScraperFactory } from './scraper.factory.js';
import { OLXIndiaScraper } from './olx-india.scraper.js';
import { OLXIndonesiaScraper } from './olx-indonesia.scraper.js';
import { OLXCentralAsiaScraper } from './olx-central-asia.scraper.js';
import { SearchLocationsArgsSchema } from '../../tools/locations/search-locations.tool.js';
import { OLX_DOMAINS } from '../../core/domains.js';
import {
  GetListingDetailsArgsSchema,
  SearchListingsArgsSchema,
} from '../../validation/schemas/listing.schema.js';
import {
  createPlaywrightMocks,
  resetPlaywrightMocks,
  setupOLXScrapingMocks,
} from '../../../tests/mocks/playwright.mock.js';
import { assertIsSuccess } from '../../../tests/utils/test-helpers.js';

beforeEach(() => resetPlaywrightMocks());

describe('country routing and URL behavior', () => {
  it('routes all nine domains and validates them consistently', () => {
    const { browser } = createPlaywrightMocks();
    const factory = new OlxScraperFactory(browser);
    for (const domain of OLX_DOMAINS) {
      expect(SearchListingsArgsSchema.parse({ domain, query: 'test' }).domain).toBe(domain);
      expect(GetListingDetailsArgsSchema.parse({ domain, listingId: '123' }).domain).toBe(domain);
      expect(factory.getScraper(domain)).toBe(factory.getScraper(domain));
    }
    expect(factory.getScraper('olx.co.id')).toBeInstanceOf(OLXIndonesiaScraper);
    expect(factory.getScraper('olx.kz')).toBeInstanceOf(OLXCentralAsiaScraper);
    expect(factory.getScraper('olx.uz')).toBeInstanceOf(OLXCentralAsiaScraper);
  });

  it('rejects the removed country at every tool boundary and scraper routing', () => {
    const domain = 'olx.com.br';
    expect(() => SearchListingsArgsSchema.parse({ domain, query: 'test' })).toThrow();
    expect(() => GetListingDetailsArgsSchema.parse({ domain, listingId: '123' })).toThrow();
    expect(() => SearchLocationsArgsSchema.parse({ domain, query: 'test' })).toThrow();
    const { browser } = createPlaywrightMocks();
    expect(() => new OlxScraperFactory(browser).getScraper(domain as any)).toThrow(
      'Unsupported OLX domain'
    );
  });

  it.each(['olx.kz', 'olx.uz'] as const)(
    'uses native categories and preserves Cyrillic searches on %s',
    domain => {
      const { browser } = createPlaywrightMocks();
      const scraper = new OLXCentralAsiaScraper(domain, browser) as any;
      const url = new URL(
        scraper.buildSearchUrl({
          domain,
          query: 'ноутбук',
          category: 'elektronika/kompyutery/noutbuki',
          location: 'tashkent',
          maxPrice: 100,
          sortBy: 'price-asc',
          page: 2,
        })
      );
      expect(decodeURIComponent(url.pathname)).toBe(
        '/elektronika/kompyutery/noutbuki/tashkent/q-ноутбук/'
      );
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('search[filter_float_price:to]')).toBe('100');
      expect(url.searchParams.get('search[order]')).toBe('filter_float_price:asc');
      expect(() => scraper.buildSearchUrl({ domain, category: '../evil' })).toThrow(
        'native category path'
      );
      expect(new URL(scraper.buildSearchUrl({ domain, query: 'laptop' })).pathname).toBe(
        '/list/q-laptop/'
      );
    }
  );

  it('extracts native IDs and never invents uncached Indonesia detail routes', async () => {
    const { browser } = createPlaywrightMocks();
    const indonesia = new OLXIndonesiaScraper(browser) as any;
    expect(indonesia.extractListingId('/item/sample-iid-1234567890')).toBe('1234567890');
    expect(indonesia.extractListingId('/unknown')).toMatch(/^u/);
    await expect(indonesia.findListingUrl()).rejects.toThrow('Search Indonesia first');
  });

  it('rejects fractional pages/limits and contradictory price ranges involving zero', () => {
    expect(() =>
      SearchListingsArgsSchema.parse({ domain: 'olx.in', query: 'test', page: 1.5 })
    ).toThrow();
    expect(() =>
      SearchListingsArgsSchema.parse({ domain: 'olx.in', query: 'test', limit: 2.5 })
    ).toThrow();
    expect(() =>
      SearchListingsArgsSchema.parse({ domain: 'olx.in', query: 'test', minPrice: 10, maxPrice: 0 })
    ).toThrow('Max price');
  });

  it('rejects a blank new-country page rather than returning zero results', async () => {
    const { browser } = createPlaywrightMocks();
    const { mockPage } = setupOLXScrapingMocks();
    mockPage.$$eval.mockResolvedValue([]);
    mockPage.$eval.mockResolvedValue(0);
    const result = await new OLXCentralAsiaScraper('olx.kz', browser).scrape({
      domain: 'olx.kz',
      query: 'sample',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('No recognized listing');
  });
});

describe.each(['olx.in', 'olx.co.id'] as const)('%s load-more pagination', domain => {
  function setup() {
    const { browser, page } = createPlaywrightMocks();
    const { mockPage } = setupOLXScrapingMocks();
    const cards = [
      { title: 'First', price: 'Rp 100', relativeUrl: '/item/first-iid-1' },
      { title: 'Second', price: 'Rp 200', relativeUrl: '/item/second-iid-2' },
    ];
    let count = 1;
    const more = {
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockImplementation(async () => {
        count = 2;
      }),
    };
    Object.assign(page, {
      locator: vi.fn().mockReturnValue({ count: vi.fn().mockImplementation(async () => count) }),
      getByRole: vi.fn().mockReturnValue(more),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    });
    mockPage.$$eval.mockImplementation(async selector =>
      selector.includes('itemBox') ? cards.slice(0, count) : []
    );
    return {
      scraper:
        domain === 'olx.in' ? new OLXIndiaScraper(browser) : new OLXIndonesiaScraper(browser),
      page,
      more,
    };
  }
  it('loads a second batch and returns only its listings', async () => {
    const { scraper, page, more } = setup();
    const result = await scraper.scrape({
      domain,
      query: 'laptop',
      page: 2,
      limit: 1,
    });
    assertIsSuccess(result);
    expect(result.data.listings.map(row => row.id)).toEqual(['2']);
    expect(result.data.currentPage).toBe(2);
    expect(result.data.hasNextPage).toBe(true);
    expect(more.click).toHaveBeenCalledOnce();
    expect((page.goto as any).mock.calls[0][0]).not.toContain('page=');
    expect(page.close).toHaveBeenCalledOnce();
  });
  it('retries an ignored pre-hydration click once', async () => {
    const { scraper, page, more } = setup();
    more.click.mockImplementationOnce(async () => {});
    const timeout = new Error('No new cards');
    timeout.name = 'TimeoutError';
    (page.waitForFunction as any).mockRejectedValueOnce(timeout);
    const result = await scraper.scrape({ domain, query: 'laptop', page: 2 });
    assertIsSuccess(result);
    expect(result.data.listings.map(row => row.id)).toEqual(['2']);
    expect(more.click).toHaveBeenCalledTimes(2);
    expect(page.close).toHaveBeenCalledOnce();
  });
  it('returns no further listings when load-more is absent', async () => {
    const { scraper, more } = setup();
    more.count.mockResolvedValue(0);
    const result = await scraper.scrape({ domain, query: 'laptop', page: 2 });
    assertIsSuccess(result);
    expect(result.data.listings).toEqual([]);
    expect(result.data.hasNextPage).toBe(false);
  });
  it('rejects unverified filters and bounds load-more work', () => {
    const { browser } = createPlaywrightMocks();
    const scraper = new OLXIndonesiaScraper(browser);
    const build = (scraper as any).buildSearchUrl.bind(scraper);
    expect(() => build({ domain: 'olx.co.id', query: 'laptop', minPrice: 0 })).toThrow(
      'not verified'
    );
    expect(() => build({ domain: 'olx.co.id', query: 'laptop', page: 11 })).toThrow('10 batches');
    expect(() => build({ domain: 'olx.co.id', query: 'laptop', location: 'Jakarta' })).toThrow(
      'canonical'
    );
    expect(
      build({ domain: 'olx.co.id', query: 'laptop', location: 'jakarta-selatan_g4000030' })
    ).toContain('/jakarta-selatan_g4000030/items/q-laptop');
  });
});
