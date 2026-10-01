import type { Browser, Page, Response } from 'playwright';
import { OLX_BROWSER_USER_AGENT } from '../core/browser-profile.js';
import type { LocationDomain } from '../core/domains.js';
import { getDomainConfig } from '../scrapers/olx/domain-config.js';
import { assertPageAccessible } from '../scrapers/olx/page-status.js';
import { canonicalLocationValue, parseLocationSuggestions } from './location-parser.js';
import type { LocationMatch, LocationProvider, LocationQuery } from './types.js';

const INPUTS: Record<LocationDomain, string> = {
  'olx.in':
    '[data-aut-id="locationBox"] input, input[placeholder*="location" i], input[placeholder*="city" i]',
  'olx.co.id': '[data-aut-id="locationBox"] input, input[placeholder*="kota" i]',
  'olx.kz':
    'input[data-testid="location-search-input"], input[placeholder*="Вся страна"], input[placeholder*="город" i]',
  'olx.uz':
    'input[data-testid="location-search-input"], input[placeholder*="Вся страна"], input[placeholder*="город" i]',
};

/** Live public location picker, with directory lookup for the legacy city routes. */
export class BrowserLocationProvider implements LocationProvider {
  constructor(private readonly browser: Browser) {}

  async lookup(query: LocationQuery): Promise<LocationMatch[]> {
    const page = await this.browser.newPage({ userAgent: OLX_BROWSER_USER_AGENT });
    page.setDefaultTimeout(10000);
    const deadline = setTimeout(() => {
      void page.close().catch(() => {});
    }, 30000);
    try {
      const config = getDomainConfig(query.domain);
      const response = await page.goto(config.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await assertPageAccessible(page, response);
      const input = page.locator(INPUTS[query.domain]).first();
      if (!(await input.count())) {
        return await this.lookupDirectory(page, query);
      }

      const observed: LocationMatch[] = [];
      const tasks: Promise<void>[] = [];
      const observe = (response: Response) => {
        const url = new URL(response.url());
        if (!this.isLocationResponse(response, query.domain)) return;
        tasks.push(
          response
            .json()
            .then(payload => {
              observed.push(
                ...parseLocationSuggestions(
                  query.domain,
                  payload,
                  /\/regions\//.test(url.pathname) ? 'regions' : 'suggestions'
                )
              );
            })
            .catch(() => {})
        );
      };
      page.on('response', observe);
      // Existing region options can appear before the query's autocomplete response.
      // Start the network wait before filling; DOM readiness alone is insufficient.
      const suggestionResponse = this.waitForSuggestions(page, query);
      try {
        await input.fill(query.query);
        await page
          .waitForSelector(
            '[role="option"], [data-aut-id="locationSuggestions"], [data-testid="location-suggestions"], [data-testid="location-suggestion"], [data-testid="location-empty"]',
            { timeout: 5000 }
          )
          .catch(() => {});
        const firstResponse = await suggestionResponse;
        // Reading response bodies can outlive the response-header event.
        await Promise.all(tasks);
        observed.push(...(await this.readLocationLinks(page, query.domain)));
        if (!firstResponse && !this.filter(observed, query).length) {
          // Server-rendered inputs can appear before their event handlers hydrate.
          // Retry the UI interaction once after the bounded response wait.
          const retryResponse = this.waitForSuggestions(page, query);
          await input.click();
          await input.fill('');
          await input.fill(query.query);
          await retryResponse;
          await Promise.all(tasks);
          observed.push(...(await this.readLocationLinks(page, query.domain)));
        }
      } finally {
        page.off('response', observe);
      }
      const matches = this.filter(observed, query);
      if (matches.length > 0) return matches;
      // Some pickers return opaque IDs rather than canonical paths. Ask the UI
      // to select its own suggestion and read the resulting route instead of
      // manufacturing a slug from the suggestion's display name.
      const selected = await this.readSelectedRoutes(page, query);
      const selectedMatches = this.filter(selected, query);
      if (selectedMatches.length) return selectedMatches;
      const empty = page.getByText(
        /no locations found|no results found|lokasi tidak ditemukan|ничего не найдено/i
      );
      if (await empty.count()) return [];
      // A directory can provide canonical city links when the picker uses opaque internal state.
      return await this.lookupDirectory(page, query);
    } catch (error) {
      throw new Error(
        `Live location lookup failed on ${query.domain}: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(deadline);
      await page.close().catch(() => {});
    }
  }

  private async readSelectedRoutes(page: Page, query: LocationQuery): Promise<LocationMatch[]> {
    const selector =
      '[role="option"], [data-aut-id="locationItem"], [data-testid="location-suggestion"]';
    const options = page.locator(selector);
    const count = Math.min(await options.count(), query.limit);
    if (!count) return [];
    const labels = (await options.allTextContents()).slice(0, count);
    const locations: LocationMatch[] = [];
    const baseUrl = getDomainConfig(query.domain).baseUrl;
    for (const [index, label] of labels.entries()) {
      if (!label.trim()) continue;
      // Refresh the picker after selecting a previous result, which may navigate.
      if (index > 0) {
        const response = await page.goto(baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });
        await assertPageAccessible(page, response);
        const input = page.locator(INPUTS[query.domain]).first();
        await input.fill(query.query);
        await page.waitForSelector(selector, { timeout: 5000 });
      }
      const exactLabel = new RegExp(
        String.raw`^\s*${label.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*$`
      );
      const optionsForLabel = page.locator(selector).filter({ hasText: exactLabel });
      if ((await optionsForLabel.count()) !== 1) continue;
      const option = optionsForLabel.first();
      await option.click();
      const submitSelector = getDomainConfig(query.domain).locationSearchSubmit;
      const search = submitSelector
        ? page.locator(submitSelector).first()
        : page.getByRole('button', { name: /^(search|cari|поиск)$/i }).first();
      if (await search.count()) await search.click();
      await page
        .waitForURL(url => Boolean(this.routeValue(query.domain, url)), { timeout: 3000 })
        .catch(() => {});
      const searchValue = this.routeValue(query.domain, new URL(page.url()));
      if (searchValue) {
        locations.push({ id: searchValue, name: label.trim(), type: 'city', searchValue });
        // One canonical match is useful even when resolving further opaque options
        // would require another navigation and exceed the provider deadline.
        if (this.filter(locations, query).length) return locations;
      }
    }
    return locations;
  }

  private routeValue(domain: LocationDomain, url: URL): string | undefined {
    if (url.protocol !== 'https:' || (url.hostname !== domain && url.hostname !== `www.${domain}`))
      return undefined;
    if (domain === 'olx.in' || domain === 'olx.co.id') {
      const first = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return canonicalLocationValue(domain, first);
    }
    return canonicalLocationValue(domain, url.toString());
  }

  private waitForSuggestions(page: Page, query: LocationQuery): Promise<Response | undefined> {
    return page
      .waitForResponse(
        response => {
          if (!this.isLocationResponse(response, query.domain)) return false;
          const url = new URL(response.url());
          const suggestionPath = getDomainConfig(query.domain).locationSuggestionsPath;
          if (suggestionPath && url.pathname !== suggestionPath) return false;
          if (/\/regions\/?$/.test(url.pathname)) return false;
          const term = ['query', 'q', 'search', 'searchTerm', 'term']
            .map(key => url.searchParams.get(key))
            .find(value => value !== null);
          return (
            term === undefined ||
            term.normalize('NFC').toLocaleLowerCase() ===
              query.query.normalize('NFC').toLocaleLowerCase()
          );
        },
        { timeout: 5000 }
      )
      .catch(() => undefined);
  }

  private isLocationResponse(response: Response, domain: LocationDomain): boolean {
    const url = new URL(response.url());
    return (
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) &&
      /location|geograph|suggest|geo.encoder|cities|region/i.test(url.pathname) &&
      response.ok() &&
      /json/i.test(response.headers()['content-type'] ?? '')
    );
  }

  private filter(locations: LocationMatch[], query: LocationQuery): LocationMatch[] {
    const needle = query.query.normalize('NFC').toLocaleLowerCase();
    const unique = new Map<string, LocationMatch>();
    for (const location of locations) {
      if (!location.name.normalize('NFC').toLocaleLowerCase().includes(needle)) continue;
      if (query.parentId && location.parentId !== query.parentId) continue;
      unique.set(location.searchValue, location);
    }
    return [...unique.values()]
      .sort(
        (a, b) =>
          Number(b.name.normalize('NFC').toLocaleLowerCase() === needle) -
          Number(a.name.normalize('NFC').toLocaleLowerCase() === needle)
      )
      .slice(0, query.limit);
  }

  private async readLocationLinks(page: Page, domain: LocationDomain): Promise<LocationMatch[]> {
    const currentUrl = new URL(page.url());
    if (
      currentUrl.protocol !== 'https:' ||
      ![domain, `www.${domain}`].includes(currentUrl.hostname)
    )
      return [];
    const candidates = await page.$$eval('a[href], [data-location-slug]', elements =>
      elements.map(element => ({
        name: element.textContent?.trim() ?? '',
        value: element.getAttribute('data-location-slug') ?? element.getAttribute('href') ?? '',
        // Plain links on European homepages are mostly categories, not locations.
        location:
          element.hasAttribute('data-location-slug') ||
          Boolean(
            element.closest(
              '[role="listbox"], [data-testid="location-suggestions"], [data-aut-id="locationSuggestions"]'
            )
          ),
      }))
    );
    const result: LocationMatch[] = [];
    for (const candidate of candidates) {
      if ((domain === 'olx.kz' || domain === 'olx.uz') && !candidate.location) continue;
      const searchValue = canonicalLocationValue(domain, candidate.value);
      if (searchValue && candidate.name)
        result.push({ id: searchValue, name: candidate.name, type: 'city', searchValue });
    }
    return result;
  }

  private async lookupDirectory(page: Page, query: LocationQuery): Promise<LocationMatch[]> {
    if (query.domain !== 'olx.in' && query.domain !== 'olx.co.id') {
      throw new Error(
        'The location picker did not expose canonical location data; no location has been guessed'
      );
    }
    const response = await page.goto(`${getDomainConfig(query.domain).baseUrl}/sitemap/cities`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await assertPageAccessible(page, response);
    const links = await this.readLocationLinks(page, query.domain);
    if (!links.length)
      throw new Error('The live city directory did not contain recognized location links');
    const matches = this.filter(links, query);
    if (!matches.length)
      throw new Error(
        'No matching canonical location in the city directory; this directory may not cover all localities'
      );
    return matches;
  }
}
