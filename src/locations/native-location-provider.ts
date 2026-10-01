import { connect, type ClientHttp2Stream } from 'node:http2';
import { getDomainConfig } from '../scrapers/olx/domain-config.js';
import { parseNativeLocationMetadata } from './location-parser.js';
import type { LocationMatch, LocationProvider, LocationQuery } from './types.js';

/** Public OLX JSON only: fixed origins, no cookies, credentials, or redirects. */
export function fetchLocationJson(url: URL): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const session = connect(url.origin);
    let settled = false;
    const deadline = setTimeout(
      () => finish(new Error('Location API exceeded its 15-second deadline')),
      15000
    );
    const finish = (error?: Error, value?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      session.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    session.on('error', error => finish(error));
    session.on('close', () =>
      finish(new Error('Location API connection closed before completing'))
    );
    let request: ClientHttp2Stream;
    try {
      request = session.request({
        ':path': `${url.pathname}${url.search}`,
        accept: 'application/json',
        'user-agent': 'OLX-MCP/0.1.0 (+https://github.com/Harsh-2002/OLX-MCP)',
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let body = '';
    let bytes = 0;
    request.on('error', error => finish(error));
    request.on('aborted', () => finish(new Error('Location API response was aborted')));
    request.on('response', headers => {
      if (headers[':status'] !== 200)
        finish(new Error(`Location API returned HTTP ${headers[':status']}`));
      else if (!String(headers['content-type']).includes('application/json'))
        finish(new Error('Location API returned a non-JSON response'));
    });
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1048576) finish(new Error('Location API response exceeded 1 MiB'));
      else body += chunk;
    });
    request.on('end', () => {
      if (settled) return;
      try {
        finish(undefined, JSON.parse(body));
      } catch {
        finish(new Error('Location API returned invalid JSON'));
      }
    });
    request.end();
  });
}

/** Numeric routes use IDs returned by OLX; display names never become guessed slugs. */
export class NativeLocationProvider implements LocationProvider {
  constructor(private readonly fetchJson = fetchLocationJson) {}

  async lookup(query: LocationQuery): Promise<LocationMatch[]> {
    const config = getDomainConfig(query.domain);
    if (!config.locationSuggestionsPath || !config.locationIdRoutePrefix)
      throw new Error(`No native location API configured for ${query.domain}`);
    const url = new URL(config.locationSuggestionsPath, config.baseUrl);
    url.searchParams.set('input', query.query);
    // Fetch a broader bounded set before narrowing by parent; a caller's limit
    // must not discard a same-name result in the requested region first.
    url.searchParams.set('limit', query.parentId ? '50' : String(query.limit));
    try {
      const payload = await this.fetchJson(url);
      const suggestions = (payload as { data?: { suggestions?: unknown } } | null)?.data
        ?.suggestions;
      if (!Array.isArray(suggestions))
        throw new Error('Location API did not contain a recognized suggestions envelope');
      const rows = parseNativeLocationMetadata(suggestions);
      if (suggestions.length && !rows.length)
        throw new Error('Location API contained no recognized location records');
      const needle = query.query.normalize('NFC').toLocaleLowerCase();
      return rows
        .filter(
          row =>
            row.name.normalize('NFC').toLocaleLowerCase().includes(needle) &&
            (!query.parentId || row.parentId === query.parentId)
        )
        .sort(
          (a, b) =>
            Number(b.name.normalize('NFC').toLocaleLowerCase() === needle) -
            Number(a.name.normalize('NFC').toLocaleLowerCase() === needle)
        )
        .slice(0, query.limit)
        .map(row => ({ ...row, searchValue: `${config.locationIdRoutePrefix}${row.id}` }));
    } catch (error) {
      throw new Error(
        `Live location lookup failed on ${query.domain}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export class OlxLocationProvider implements LocationProvider {
  constructor(
    private readonly browserProvider: LocationProvider,
    private readonly nativeProvider: LocationProvider = new NativeLocationProvider()
  ) {}

  lookup(query: LocationQuery): Promise<LocationMatch[]> {
    return (
      getDomainConfig(query.domain).locationIdRoutePrefix
        ? this.nativeProvider
        : this.browserProvider
    ).lookup(query);
  }
}
