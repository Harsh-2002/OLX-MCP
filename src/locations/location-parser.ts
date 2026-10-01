import type { LocationDomain } from '../core/domains.js';
import type { LocationMatch } from './types.js';

/** Accept only a canonical route actually supplied by OLX, never a guessed city slug. */
export function canonicalLocationValue(domain: LocationDomain, value: string): string | undefined {
  let path = value;
  if (value.startsWith('/') || /^https?:/i.test(value)) {
    try {
      const url = new URL(value, `https://www.${domain}`);
      if (url.protocol !== 'https:' || ![domain, `www.${domain}`].includes(url.hostname))
        return undefined;
      path = url.pathname.replace(/^\/+|\/+$/g, '');
    } catch {
      return undefined;
    }
  }
  if (domain === 'olx.in' || domain === 'olx.co.id') {
    return /^[a-z0-9-]+_[gr]\d+$/i.test(path) ? path : undefined;
  }
  if (domain === 'olx.com.br') {
    return /^estado-[a-z]{2}(?:\/[a-z0-9-]+)*$/.test(path) ? path : undefined;
  }
  return /^[a-z0-9-]+$/i.test(path) ? path : undefined;
}

/** Read public suggestion envelopes; absent canonical data is not synthesized. */
export function parseLocationSuggestions(
  domain: LocationDomain,
  payload: unknown,
  source: 'regions' | 'suggestions' = 'suggestions'
): LocationMatch[] {
  const results: LocationMatch[] = [];
  const visited = new Set<string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 8 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const row = value as Record<string, unknown>;
    if (
      (domain === 'olx.kz' || domain === 'olx.uz') &&
      row['city'] &&
      typeof row['city'] === 'object'
    ) {
      // District suggestions share a city route but need additional native filters.
      // Do not incorrectly label them as independent cities or discard their filter.
      if (row['district']) return;
      const city = row['city'] as Record<string, unknown>;
      const region = row['region'] as Record<string, unknown> | undefined;
      walk(
        { ...city, type: 'city', parentId: region?.['id'], region: region?.['name'] },
        depth + 1
      );
      return;
    }
    const name = row['name'] ?? row['label'] ?? row['display_name'];
    const token =
      row['searchValue'] ??
      row['slug'] ??
      row['url'] ??
      row['href'] ??
      row['seo_url'] ??
      (domain === 'olx.kz' || domain === 'olx.uz' ? row['normalized_name'] : undefined);
    const type = row['type'] ?? (source === 'regions' ? 'region' : undefined);
    const searchValue =
      typeof token === 'string' ? canonicalLocationValue(domain, token) : undefined;
    if (typeof name === 'string' && name.trim() && searchValue && !visited.has(searchValue)) {
      visited.add(searchValue);
      const id =
        typeof row['id'] === 'string' || typeof row['id'] === 'number'
          ? String(row['id'])
          : searchValue;
      const parent = row['parentId'] ?? row['parent_id'];
      const region = row['region'] ?? row['state_name'];
      results.push({
        id,
        name: name.trim(),
        searchValue,
        type:
          typeof type === 'string' && /state|region|province/i.test(type)
            ? 'region'
            : typeof type === 'string' && /district/i.test(type)
              ? 'district'
              : typeof type === 'string' && /locality|neighbourhood/i.test(type)
                ? 'locality'
                : 'city',
        ...(typeof parent === 'string' || typeof parent === 'number'
          ? { parentId: String(parent) }
          : {}),
        ...(typeof region === 'string' ? { region } : {}),
      });
    }
    for (const key of ['data', 'results', 'locations', 'suggestions', 'items', 'location'])
      walk(row[key], depth + 1);
  };
  walk(payload, 0);
  return results;
}
