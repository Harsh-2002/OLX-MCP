import type { LocationMatch, LocationProvider, LocationQuery } from './types.js';

/** Successful, unexpired lookups only; shared fetches have independent caller cancellation. */
export class LocationService {
  private readonly cache = new Map<string, { expires: number; matches: LocationMatch[] }>();
  private generation = 0;
  private readonly pending = new Map<string, Promise<LocationMatch[]>>();

  constructor(
    private readonly provider: LocationProvider,
    private readonly now = Date.now
  ) {}

  async search(
    query: LocationQuery,
    signal?: AbortSignal
  ): Promise<{ locations: LocationMatch[] }> {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const normalized = { ...query, query: query.query.trim().normalize('NFC') };
    const key = JSON.stringify([
      query.domain,
      normalized.query.toLocaleLowerCase(),
      query.parentId ?? '',
      query.limit,
    ]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return { locations: cached.matches };
    this.cache.delete(key);

    let lookup = this.pending.get(key);
    if (!lookup) {
      const generation = this.generation;
      lookup = this.provider
        .lookup(normalized)
        .then(matches => {
          if (generation !== this.generation) return matches;
          const prefix = `["${query.domain}",`;
          const domainKeys = [...this.cache.keys()].filter(k => k.startsWith(prefix));
          if (domainKeys.length >= 200) this.cache.delete(domainKeys[0]!);
          this.cache.set(key, { expires: this.now() + 600000, matches });
          return matches;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, lookup);
    }
    if (!signal) return { locations: await lookup };
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error('Operation cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      lookup!
        .then(matches => {
          if (signal.aborted) reject(new Error('Operation cancelled'));
          else resolve({ locations: matches });
        }, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  }

  clear(): void {
    this.generation++;
    this.cache.clear();
  }
}
