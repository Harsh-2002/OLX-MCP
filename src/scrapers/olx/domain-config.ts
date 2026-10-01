import { DomainConfig, DomainSelectors, OlxDomain } from '../../core/types.js';
import { resolveOlxIndiaLocation } from './olx-india-locations.js';

/** Selectors shared by the existing European adapters; other layouts are separate. */
const COMMON_SELECTORS: DomainSelectors = {
  search: {
    listingCard: '[data-cy="l-card"]',
    title: '[data-testid="ad-card-title"] h4, [data-testid="ad-card-title"] h6',
    price: '[data-testid="ad-price"]',
    location: '[data-testid="location-date"]',
    image: 'img',
    link: 'a[href]',
    publishDate: '[data-testid="location-date"] span:last-child',
    nextPage: '[data-testid="pagination-forward"]',
    totalCount: '[data-testid="total-count"]',
  },
  detail: {
    title: '[data-testid="offer_title"]',
    price: '[data-testid="ad-price-container"]',
    description: '[data-testid="ad_description"]',
    // Scoped to the ad's own gallery: a bare '.swiper-slide' also matches the
    // related-ads carousels further down the page.
    images: '[data-cy="adPhotos-swiperSlide"] img',
    location: '[data-testid="map-aside-section"]',
    publishDate: '[data-testid="ad-posted-at"]',
    seller: {
      name: '[data-testid="user-profile-user-name"]',
      phone: '[data-testid="phones-container"]',
      verified: '[data-testid="trader-title"]',
      memberSince: '[data-testid="member-since"]',
    },
    category: '.breadcrumb-item:last-child',
    attributes: '[data-cy="ad-params"] li',
  },
};

/** OLX India still exposes its legacy data-aut-id markup rather than the shared test-id markup. */
export const INDIA_SELECTORS: DomainSelectors = {
  search: {
    listingCard: 'li[data-aut-id^="itemBox"]',
    title: '[data-aut-id="itemTitle"]',
    price: '[data-aut-id="itemPrice"]',
    location: '[data-aut-id="item-location"]',
    image: '[data-aut-id="itemImage"] img',
    link: 'a[href*="/item/"][href*="iid-"]',
    publishDate: '[data-aut-id="itemDate"]',
    nextPage: 'button[data-aut-id="btnLoadMore"]',
    totalCount: '[data-aut-id="searchTextPage"] + span',
  },
  detail: {
    title: 'h1[data-aut-id="itemTitle"]',
    price: '[data-aut-id="itemPrice"]',
    description: '[data-aut-id="itemDescriptionContent"]',
    images: 'figure[data-aut-id="defaultImg"] img',
    location: '[data-aut-id="itemLocation"]',
    publishDate: '[data-aut-id="itemCreationDate"]',
    seller: {
      name: '[data-aut-id="userTitle"] > span:last-child',
      phone: '[data-aut-id="phone"]',
      verified: '[data-aut-id="businessTag"]',
      memberSince: '[data-aut-id="memberSince"]',
    },
    category: '[data-aut-id="breadcrumb"] li:last-child',
    attributes: '[data-aut-id="itemAttributes"] li',
  },
};

/** Ordered replacements folding a language's diacritics down to ASCII. */
type DiacriticFolding = ReadonlyArray<readonly [RegExp, string]>;

const POLISH_FOLDING: DiacriticFolding = [
  [/ą/g, 'a'],
  [/ć/g, 'c'],
  [/ę/g, 'e'],
  [/ł/g, 'l'],
  [/ń/g, 'n'],
  [/ó/g, 'o'],
  [/ś/g, 's'],
  [/ź/g, 'z'],
  [/ż/g, 'z'],
];

const ROMANIAN_FOLDING: DiacriticFolding = [
  [/ă/g, 'a'],
  [/â/g, 'a'],
  [/î/g, 'i'],
  [/ș/g, 's'],
  [/ț/g, 't'],
];

const fold = (value: string, folding: DiacriticFolding): string =>
  folding.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);

/**
 * Folding runs before punctuation is dropped, otherwise the strip would delete
 * the accented characters outright and the folding would never apply.
 *
 * Letters outside the ASCII range that no folding table covers — Cyrillic on
 * olx.ua and olx.bg — are percent-encoded rather than removed. Deleting them
 * produced an empty "q-" slug, and OLX answers that with its unfiltered
 * all-ads page, so every Cyrillic search silently returned arbitrary listings.
 */
const slugifyQuery = (query: string, folding: DiacriticFolding): string => {
  const slug = fold(query.toLowerCase(), folding)
    // Keep letters and digits of any script; drop punctuation only.
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return /^[a-z0-9-]*$/.test(slug) ? slug : encodeURIComponent(slug);
};

const slugifyLocation = (location: string, folding: DiacriticFolding): string =>
  fold(location.toLowerCase().replace(/\s+/g, '-'), folding);

/**
 * OLX addresses searches either as /<location>/q-<query>/ or, with no location,
 * as <listingPath>q-<query>/ — where listingPath is the domain's "all ads" path.
 */
const buildSearchPath =
  (listingPath: string, folding: DiacriticFolding = []) =>
  (location?: string, query?: string): string => {
    if (location) {
      const base = `/${slugifyLocation(location, folding)}`;
      return query ? `${base}/q-${slugifyQuery(query, folding)}/` : `${base}/`;
    }
    return query ? `${listingPath}q-${slugifyQuery(query, folding)}/` : listingPath;
  };

/** OLX India puts the /items segment after an optional location slug. */
const buildIndiaSearchPath = (location?: string, query?: string): string => {
  const locationPath = location ? `/${resolveOlxIndiaLocation(location)}` : '';
  const base = `${locationPath}/items/`;
  return query ? `${base}q-${slugifyQuery(query, [])}/` : base;
};

/** Identical on every domain observed so far. */
const COMMON_URL_PARAMS = {
  priceParams: {
    min: 'search[filter_float_price:from]',
    max: 'search[filter_float_price:to]',
  },
  sortParams: {
    date: 'created_at:desc',
    'price-asc': 'filter_float_price:asc',
    'price-desc': 'filter_float_price:desc',
  },
  categoryParam: 'c',
  pageParam: 'page',
} as const;

/** Brazil uses the OLX Brazil design system rather than European card markup.
 * These selectors require live verification when the site changes.
 */
const BRAZIL_SELECTORS: DomainSelectors = {
  search: {
    listingCard: 'section.olx-adcard, [data-testid="adcard"], [data-testid="ad-card"]',
    title: '.olx-adcard__title, h2, h3',
    price: '.olx-adcard__price, [data-testid="ad-price"]',
    location: '.olx-adcard__location, [data-testid="ad-location"]',
    image: 'img',
    link: 'a.olx-adcard__link, a[href]',
    publishDate: '.olx-adcard__date',
    nextPage: 'a[rel="next"], [aria-label="Próxima página"]',
    totalCount: '[data-testid="ad-count"], .olx-search-result-counter',
    emptyState: '[data-testid="no-results"], .olx-empty-state',
  },
  detail: {
    ...COMMON_SELECTORS.detail,
    title: 'h1',
    price: '[data-testid="ad-price"], .olx-ad-price',
    description: '[data-testid="ad-description"], .olx-ad-description',
    images: '[data-testid="ad-gallery"] img, .olx-ad-gallery img',
    location: '[data-testid="ad-location"], .olx-ad-location',
    seller: {
      ...COMMON_SELECTORS.detail.seller,
      name: '[data-testid="seller-name"], .olx-seller-name',
      verified: '[data-testid="seller-verified"]',
    },
  },
};

const buildIndonesiaSearchPath = (location?: string, query?: string): string => {
  if (location && !/^(?:[a-z0-9-]+_[gr]\d+|_g[1-9]\d*)$/i.test(location)) {
    throw new Error('Use searchLocations to obtain a canonical Indonesia location');
  }
  const base = `${location ? `/${location}` : ''}/items/`;
  return query ? `${base}q-${slugifyQuery(query, [])}` : base;
};

const buildBrazilSearchPath = (location?: string): string => {
  if (location && !/^estado-[a-z]{2}(?:\/[a-z0-9-]+)*$/.test(location)) {
    throw new Error('Use searchLocations to obtain a canonical Brazil location');
  }
  return location ? `/${location}` : '/brasil';
};

export const OLX_DOMAIN_CONFIGS: Record<OlxDomain, DomainConfig> = {
  'olx.pt': {
    searchJavaScriptEnabled: false,
    domain: 'olx.pt',
    baseUrl: 'https://www.olx.pt',
    currency: 'EUR',
    language: 'pt',
    selectors: COMMON_SELECTORS,
    urlPatterns: { searchPath: buildSearchPath('/ads/'), ...COMMON_URL_PARAMS },
  },

  'olx.pl': {
    searchJavaScriptEnabled: false,
    detailJavaScriptEnabled: false,
    domain: 'olx.pl',
    baseUrl: 'https://www.olx.pl',
    currency: 'PLN',
    language: 'pl',
    selectors: {
      ...COMMON_SELECTORS,
      detail: { ...COMMON_SELECTORS.detail, title: '[data-testid="offer_title"] h4' },
    },
    urlPatterns: { searchPath: buildSearchPath('/oferty/', POLISH_FOLDING), ...COMMON_URL_PARAMS },
  },

  'olx.bg': {
    searchJavaScriptEnabled: false,
    domain: 'olx.bg',
    baseUrl: 'https://www.olx.bg',
    currency: 'EUR',
    language: 'bg',
    selectors: COMMON_SELECTORS,
    urlPatterns: { searchPath: buildSearchPath('/ads/'), ...COMMON_URL_PARAMS },
  },

  'olx.ro': {
    searchJavaScriptEnabled: false,
    domain: 'olx.ro',
    baseUrl: 'https://www.olx.ro',
    currency: 'RON',
    language: 'ro',
    selectors: COMMON_SELECTORS,
    urlPatterns: { searchPath: buildSearchPath('/ads/', ROMANIAN_FOLDING), ...COMMON_URL_PARAMS },
  },

  'olx.ua': {
    searchJavaScriptEnabled: false,
    domain: 'olx.ua',
    baseUrl: 'https://www.olx.ua',
    currency: 'UAH',
    language: 'uk',
    selectors: COMMON_SELECTORS,
    urlPatterns: { searchPath: buildSearchPath('/ads/'), ...COMMON_URL_PARAMS },
  },

  'olx.in': {
    loadMoreButtonName: '^load more$',
    locationSuggestionsPath: '/api/locations/autocomplete',
    locationIdRoutePrefix: '_g',
    locationSearchSubmit: '[data-aut-id="btnSearch"]:visible',
    domain: 'olx.in',
    baseUrl: 'https://www.olx.in',
    currency: 'INR',
    language: 'en',
    selectors: INDIA_SELECTORS,
    urlPatterns: { searchPath: buildIndiaSearchPath, ...COMMON_URL_PARAMS },
  },
  'olx.com.br': {
    domain: 'olx.com.br',
    baseUrl: 'https://www.olx.com.br',
    currency: 'BRL',
    language: 'pt-BR',
    selectors: BRAZIL_SELECTORS,
    urlPatterns: {
      searchPath: buildBrazilSearchPath,
      priceParams: { min: 'ps', max: 'pe' },
      sortParams: { date: '', 'price-asc': '', 'price-desc': '' },
      categoryParam: 'category',
      pageParam: 'o',
    },
  },
  'olx.co.id': {
    loadMoreButtonName: '^muat lainnya$',
    locationSuggestionsPath: '/api/locations/autocomplete',
    locationIdRoutePrefix: '_g',
    locationSearchSubmit: '[data-aut-id="btnSearch"]:visible',
    domain: 'olx.co.id',
    baseUrl: 'https://www.olx.co.id',
    currency: 'IDR',
    language: 'id',
    selectors: {
      ...INDIA_SELECTORS,
      search: {
        ...INDIA_SELECTORS.search,
        emptyState: '[data-aut-id="emptyResults"], [data-aut-id="noResults"]',
      },
    },
    urlPatterns: { searchPath: buildIndonesiaSearchPath, ...COMMON_URL_PARAMS },
  },
  'olx.kz': {
    searchJavaScriptEnabled: false,
    domain: 'olx.kz',
    baseUrl: 'https://www.olx.kz',
    currency: 'KZT',
    language: 'ru',
    selectors: {
      ...COMMON_SELECTORS,
      search: {
        ...COMMON_SELECTORS.search,
        emptyState: '[data-testid="no-results"], [data-testid="no-results-message"]',
      },
    },
    urlPatterns: { searchPath: buildSearchPath('/list/'), ...COMMON_URL_PARAMS },
  },
  'olx.uz': {
    searchJavaScriptEnabled: false,
    domain: 'olx.uz',
    baseUrl: 'https://www.olx.uz',
    currency: 'UZS',
    language: 'ru',
    selectors: {
      ...COMMON_SELECTORS,
      search: {
        ...COMMON_SELECTORS.search,
        emptyState: '[data-testid="no-results"], [data-testid="no-results-message"]',
      },
    },
    urlPatterns: { searchPath: buildSearchPath('/list/'), ...COMMON_URL_PARAMS },
  },
};

export const getDomainConfig = (domain: OlxDomain): DomainConfig => {
  const config = OLX_DOMAIN_CONFIGS[domain];
  if (!config) {
    throw new Error(`Unsupported OLX domain: ${domain}`);
  }
  return config;
};

export const getSupportedDomains = (): OlxDomain[] => {
  return Object.keys(OLX_DOMAIN_CONFIGS) as OlxDomain[];
};

export const isDomainSupported = (domain: string): domain is OlxDomain => {
  return domain in OLX_DOMAIN_CONFIGS;
};
