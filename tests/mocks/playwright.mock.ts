import { vi } from 'vitest';
import type { Browser, Page, ElementHandle } from 'playwright';

import {
  createMockBrowser,
  createMockPage,
  createMockElementHandle,
} from '../utils/test-helpers.js';

/**
 * Comprehensive Playwright mocks for testing browser automation
 */

// Global mock state
let mockBrowserInstance: ReturnType<typeof createMockBrowser> | null = null;
let mockPageInstance: ReturnType<typeof createMockPage> | null = null;

// Browser mock factory
export const createPlaywrightMocks = () => {
  mockBrowserInstance = createMockBrowser();
  mockPageInstance = createMockPage();

  // Set up page creation to return our mock
  mockBrowserInstance.newPage.mockResolvedValue(mockPageInstance as unknown as Page);

  return {
    browser: mockBrowserInstance as unknown as Browser,
    page: mockPageInstance as unknown as Page,
  };
};

// Chromium launch mock
export const mockChromiumLaunch = vi.fn().mockImplementation(() => {
  if (!mockBrowserInstance) {
    const mocks = createPlaywrightMocks();
    return Promise.resolve(mocks.browser);
  }
  return Promise.resolve(mockBrowserInstance as unknown as Browser);
});

// Mock selectors and responses for OLX scraping
export const setupOLXScrapingMocks = () => {
  if (!mockPageInstance) {
    throw new Error('Mock page not initialized. Call createPlaywrightMocks() first.');
  }

  // Mock search results page
  const mockListingElements = [
    createMockElementHandle({
      $eval: vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('[data-testid="ad-card-title"]')) {
          return Promise.resolve('iPhone 13 Pro Max');
        }
        if (selector.includes('[data-testid="ad-price"]')) {
          return Promise.resolve('800€');
        }
        if (selector.includes('[data-testid="location-date"]')) {
          return Promise.resolve('Lisboa');
        }
        if (selector.includes('a[href]')) {
          return Promise.resolve('/anuncios/iphone-13-pro-max-ID123.html');
        }
        if (selector.includes('img')) {
          return Promise.resolve('https://example.com/image1.jpg');
        }
        return Promise.resolve('');
      }),
    }),
    createMockElementHandle({
      $eval: vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('[data-testid="ad-card-title"]')) {
          return Promise.resolve('Samsung Galaxy S21');
        }
        if (selector.includes('[data-testid="ad-price"]')) {
          return Promise.resolve('600€');
        }
        if (selector.includes('[data-testid="location-date"]')) {
          return Promise.resolve('Porto');
        }
        if (selector.includes('a[href]')) {
          return Promise.resolve('/anuncios/samsung-galaxy-s21-ID456.html');
        }
        if (selector.includes('img')) {
          return Promise.resolve('https://example.com/image2.jpg');
        }
        return Promise.resolve('');
      }),
    }),
  ];

  // Mock page $$ method for listing cards
  mockPageInstance.$$.mockImplementation((selector: string) => {
    if (selector.includes('[data-cy="l-card"]')) {
      return Promise.resolve(
        mockListingElements as unknown as ElementHandle<SVGElement | HTMLElement>[]
      );
    }
    return Promise.resolve([]);
  });

  // extractListings pulls every card in one $$eval, so the mock returns the
  // already-extracted field values rather than element handles. The other two
  // $$eval callsites get branches too: the detail gallery (so include/exclude
  // behaviour is observable) and the listing-id fallback lookup, which must
  // resolve to a single href string or '' — never to an array, which would be
  // truthy and coerce into a garbage URL via new URL([], base).
  mockPageInstance.$$eval.mockImplementation(
    (selector: string, _pageFunction?: unknown, arg?: unknown) => {
      if (selector.includes('[data-cy="l-card"]') && selector.includes('a[href]')) {
        const needle = typeof arg === 'string' ? arg : '';
        const fallbackListings: Record<string, string> = {
          IDABC123: '/anuncios/iphone-13-pro-max-IDABC123.html',
          IDDEF456: '/anuncios/samsung-galaxy-s21-IDDEF456.html',
          IDXYZ789: '/anuncios/test-listing-IDXYZ789.html',
          IDXyz123: '/anuncios/test-listing-IDXyz123.html',
        };
        return Promise.resolve(fallbackListings[needle] ?? '');
      }
      if (!selector.includes('[data-cy="l-card"]')) {
        if (selector.includes('adPhotos-swiperSlide')) {
          return Promise.resolve([
            'https://example.com/gallery1.jpg',
            'https://example.com/gallery2.jpg',
          ]);
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          title: 'iPhone 13 Pro Max',
          price: '800€',
          location: 'Lisboa',
          imageUrl: 'https://example.com/image1.jpg',
          relativeUrl: '/anuncios/iphone-13-pro-max-ID123.html',
        },
        {
          title: 'Samsung Galaxy S21',
          price: '600€',
          location: 'Porto',
          imageUrl: 'https://example.com/image2.jpg',
          relativeUrl: '/anuncios/samsung-galaxy-s21-ID456.html',
        },
      ]);
    }
  );

  // Mock page $eval for pagination and counts
  mockPageInstance.$eval.mockImplementation((selector: string) => {
    if (selector.includes('[data-testid="total-count"]')) {
      return Promise.resolve(2); // Total count
    }
    if (selector.includes('[data-testid="offer_title"]')) {
      return Promise.resolve('iPhone 13 Pro Max - Detailed');
    }
    if (selector.includes('[data-testid="ad-price-container"]')) {
      return Promise.resolve('800€');
    }
    if (selector.includes('[data-testid="ad_description"]')) {
      return Promise.resolve('Excellent condition iPhone 13 Pro Max');
    }
    if (selector.includes('[data-testid="map-aside-section"]')) {
      return Promise.resolve('Lisboa, Região de Lisboa');
    }
    if (selector.includes('[data-testid="user-profile-user-name"]')) {
      return Promise.resolve('John Seller');
    }
    return Promise.resolve('');
  });

  // Mock page $ method for single element selection
  mockPageInstance.$.mockImplementation((selector: string) => {
    if (selector.includes('[data-testid="pagination-forward"]')) {
      return Promise.resolve(createMockElementHandle() as unknown as ElementHandle<HTMLElement>);
    }
    if (selector.includes('[data-testid="trader-title"]')) {
      return Promise.resolve(createMockElementHandle() as unknown as ElementHandle<HTMLElement>);
    }
    return Promise.resolve(null);
  });

  // Mock page.goto for different scenarios
  mockPageInstance.goto.mockImplementation((_url: string) => {
    // Mock successful navigation
    return Promise.resolve(undefined as any);
  });

  // Mock page.$eval for search scenario in getListingDetails.
  // Capture the implementation itself, not the mock function: reading it back
  // off the mock after the override below would return the override and
  // recurse until the stack blows.
  const previousEval = mockPageInstance.$eval.getMockImplementation();
  mockPageInstance.$eval.mockImplementation((selector: string, pageFunction?: any) => {
    // Handle search for listing by ID (used in getListingDetails fallback)
    if (selector.includes('[data-cy="l-card"]') && selector.includes('href')) {
      if (selector.includes('IDABC123')) {
        return Promise.resolve('/anuncios/iphone-13-pro-max-IDABC123.html');
      }
      if (selector.includes('IDDEF456')) {
        return Promise.resolve('/anuncios/samsung-galaxy-s21-IDDEF456.html');
      }
      if (selector.includes('IDXYZ789')) {
        return Promise.resolve('/anuncios/test-listing-IDXYZ789.html');
      }
      return Promise.reject(new Error('Element not found'));
    }
    // Fall back to the implementation installed before this override
    return previousEval?.(selector, pageFunction) || Promise.resolve('');
  });

  return {
    mockListingElements,
    mockPage: mockPageInstance,
  };
};

// Mock for empty search results
export const setupEmptySearchMocks = () => {
  if (!mockPageInstance) {
    throw new Error('Mock page not initialized. Call createPlaywrightMocks() first.');
  }

  mockPageInstance.$$.mockResolvedValue([]);
  // Emulate Playwright's contract: the resolved value is the page function's
  // RETURN value, not the element list. Search extraction returns an array of
  // card objects, while the listing-id lookup returns a single string — so
  // "no anchors" must resolve to '' there or the scraper sees a truthy array.
  mockPageInstance.$$eval.mockImplementation((selector: string) => {
    if (selector.includes('a[href]')) {
      return Promise.resolve('');
    }
    return Promise.resolve([]);
  });
  mockPageInstance.$eval.mockResolvedValue(0);
  mockPageInstance.$.mockResolvedValue(null);
};

// Mock for network errors
export const setupNetworkErrorMocks = () => {
  if (!mockPageInstance) {
    throw new Error('Mock page not initialized. Call createPlaywrightMocks() first.');
  }

  mockPageInstance.goto.mockRejectedValue(new Error('Network error: Failed to navigate'));
  mockPageInstance.waitForSelector.mockRejectedValue(new Error('Selector timeout'));
};

// Mock for slow responses
export const setupSlowResponseMocks = (delay = 5000) => {
  if (!mockPageInstance) {
    throw new Error('Mock page not initialized. Call createPlaywrightMocks() first.');
  }

  mockPageInstance.goto.mockImplementation(
    () => new Promise(resolve => setTimeout(resolve, delay))
  );
};

// Reset all mocks to initial state
export const resetPlaywrightMocks = () => {
  vi.clearAllMocks();
  mockBrowserInstance = null;
  mockPageInstance = null;
};

// Mock the entire playwright module
export const mockPlaywright = () => {
  vi.mock('playwright', () => ({
    chromium: {
      launch: mockChromiumLaunch,
    },
    Browser: vi.fn(),
    Page: vi.fn(),
    ElementHandle: vi.fn(),
  }));
};

// Utility to verify mock calls
export const verifyPlaywrightCalls = () => {
  if (!mockBrowserInstance || !mockPageInstance) {
    throw new Error('Mocks not initialized');
  }

  return {
    browserLaunchCalled: mockChromiumLaunch.mock.calls.length > 0,
    newPageCalled: mockBrowserInstance.newPage.mock.calls.length > 0,
    gotoCalledWith: mockPageInstance.goto.mock.calls,
    selectorsCalled: mockPageInstance.$$.mock.calls,
    evalsCalled: mockPageInstance.$eval.mock.calls,
    browserClosed: mockBrowserInstance.close.mock.calls.length > 0,
    pageClosed: mockPageInstance.close.mock.calls.length > 0,
  };
};
