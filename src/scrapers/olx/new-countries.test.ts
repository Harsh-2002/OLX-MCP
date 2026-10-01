import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OlxScraperFactory } from './scraper.factory.js';
import { OLXBrazilScraper } from './olx-brazil.scraper.js';
import { OLXIndonesiaScraper } from './olx-indonesia.scraper.js';
import { OLXCentralAsiaScraper } from './olx-central-asia.scraper.js';
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
  it('routes all ten domains and validates them consistently', () => {
    const { browser } = createPlaywrightMocks();
    const factory = new OlxScraperFactory(browser);
    for (const domain of OLX_DOMAINS) {
      expect(SearchListingsArgsSchema.parse({ domain, query: 'test' }).domain).toBe(domain);
      expect(GetListingDetailsArgsSchema.parse({ domain, listingId: '123' }).domain).toBe(domain);
      expect(factory.getScraper(domain)).toBe(factory.getScraper(domain));
    }
    expect(factory.getScraper('olx.com.br')).toBeInstanceOf(OLXBrazilScraper);
    expect(factory.getScraper('olx.co.id')).toBeInstanceOf(OLXIndonesiaScraper);
    expect(factory.getScraper('olx.kz')).toBeInstanceOf(OLXCentralAsiaScraper);
    expect(factory.getScraper('olx.uz')).toBeInstanceOf(OLXCentralAsiaScraper);
  });

  it('uses Brazil query parameters, native category paths, and zero price bounds', () => {
    const { browser } = createPlaywrightMocks();
    const scraper = new OLXBrazilScraper(browser) as any;
    const url = new URL(
      scraper.buildSearchUrl({
        domain: 'olx.com.br',
        query: 'notebook São Paulo',
        category: 'informatica/notebooks',
        location: 'estado-sp/sao-paulo-e-regiao/sao-paulo',
        minPrice: 0,
        maxPrice: 1000,
        page: 2,
      })
    );
    expect(url.pathname).toBe('/estado-sp/sao-paulo-e-regiao/sao-paulo/informatica/notebooks');
    expect(url.searchParams.get('q')).toBe('notebook São Paulo');
    expect(url.searchParams.get('ps')).toBe('0');
    expect(url.searchParams.get('pe')).toBe('1000');
    expect(url.searchParams.get('o')).toBe('2');
    expect(url.searchParams.has('category')).toBe(false);
    expect(
      new URL(scraper.buildSearchUrl({ domain: 'olx.com.br', query: 'laptop' })).pathname
    ).toBe('/brasil');
    expect(() =>
      scraper.buildSearchUrl({ domain: 'olx.com.br', query: 'laptop', sortBy: 'date' })
    ).toThrow('not supported');
    expect(() =>
      scraper.buildSearchUrl({ domain: 'olx.com.br', query: 'laptop', location: 'São Paulo' })
    ).toThrow('canonical');
    expect(() => scraper.buildSearchUrl({ domain: 'olx.com.br', category: '../evil' })).toThrow(
      'native path'
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

  it('extracts native IDs and never invents uncached Brazil or Indonesia detail routes', async () => {
    const { browser } = createPlaywrightMocks();
    const brazil = new OLXBrazilScraper(browser) as any;
    const indonesia = new OLXIndonesiaScraper(browser) as any;
    expect(brazil.extractListingId('/informatica/notebooks/sample-1234567890')).toBe('1234567890');
    expect(indonesia.extractListingId('/item/sample-iid-1234567890')).toBe('1234567890');
    expect(brazil.extractListingId('/unknown')).toMatch(/^u/);
    expect(indonesia.extractListingId('/unknown')).toMatch(/^u/);
    await expect(brazil.findListingUrl()).rejects.toThrow('Search Brazil first');
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
    setupOLXScrapingMocks();
    const result = await new OLXBrazilScraper(browser).scrape({
      domain: 'olx.com.br',
      query: 'sample',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('No recognized listing');
  });
});

describe('Indonesia load-more pagination', () => {
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
    return { scraper: new OLXIndonesiaScraper(browser), page, more };
  }
  it('loads a second batch and returns only its listings', async () => {
    const { scraper, page, more } = setup();
    const result = await scraper.scrape({
      domain: 'olx.co.id',
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
  it('returns no further listings when load-more is absent', async () => {
    const { scraper, more } = setup();
    more.count.mockResolvedValue(0);
    const result = await scraper.scrape({ domain: 'olx.co.id', query: 'laptop', page: 2 });
    assertIsSuccess(result);
    expect(result.data.listings).toEqual([]);
    expect(result.data.hasNextPage).toBe(false);
  });
  it('rejects unverified filters and bounds load-more work', () => {
    const { scraper } = setup();
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
