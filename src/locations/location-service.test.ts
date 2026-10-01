import { describe, expect, it, vi } from 'vitest';
import { LocationService } from './location-service.js';
import type { LocationMatch, LocationQuery } from './types.js';

const query: LocationQuery = { domain: 'olx.in', query: 'Aluva', limit: 20 };
const matches: LocationMatch[] = [
  { id: 'aluva_g4395807', name: 'Aluva', type: 'city', searchValue: 'aluva_g4395807' },
];

describe('live location caching', () => {
  it('coalesces identical requests and reuses only unexpired results', async () => {
    let now = 0;
    const lookup = vi.fn().mockResolvedValue(matches);
    const service = new LocationService({ lookup }, () => now);
    await Promise.all([service.search(query), service.search(query)]);
    await service.search({ ...query, query: ' aluva ' });
    expect(lookup).toHaveBeenCalledTimes(1);
    now = 600000;
    await service.search(query);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it('never substitutes expired results when the network fails', async () => {
    let now = 0;
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(matches)
      .mockRejectedValue(new Error('TLS failure'));
    const service = new LocationService({ lookup }, () => now);
    await service.search(query);
    now = 600001;
    await expect(service.search(query)).rejects.toThrow('TLS failure');
    await expect(service.search(query)).rejects.toThrow('TLS failure');
    expect(lookup).toHaveBeenCalledTimes(3);
  });
  it('isolates cache entries by domain, parent and limit', async () => {
    const lookup = vi.fn().mockResolvedValue(matches);
    const service = new LocationService({ lookup });
    await service.search(query);
    await service.search({ ...query, domain: 'olx.co.id' });
    await service.search({ ...query, parentId: 'parent' });
    await service.search({ ...query, limit: 1 });
    expect(lookup).toHaveBeenCalledTimes(4);
  });
  it('bounds each domain cache and clears it on shutdown', async () => {
    const lookup = vi.fn().mockResolvedValue(matches);
    const service = new LocationService({ lookup });
    for (let i = 0; i < 201; i++) await service.search({ ...query, query: `city ${i}` });
    await service.search({ ...query, query: 'city 0' });
    expect(lookup).toHaveBeenCalledTimes(202);
    service.clear();
    await service.search(query);
    expect(lookup).toHaveBeenCalledTimes(203);
  });
  it('cancels one caller while leaving the shared request available to another', async () => {
    let finish!: (value: LocationMatch[]) => void;
    const lookup = vi.fn().mockImplementation(
      () =>
        new Promise<LocationMatch[]>(resolve => {
          finish = resolve;
        })
    );
    const service = new LocationService({ lookup });
    const abort = new AbortController();
    const cancelled = service.search(query, abort.signal);
    const other = service.search(query);
    abort.abort();
    await expect(cancelled).rejects.toThrow('cancelled');
    finish(matches);
    await expect(other).resolves.toEqual({ locations: matches });
    await expect(service.search(query, abort.signal)).rejects.toThrow('cancelled');
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it('does not repopulate cleared cache when a pending lookup completes', async () => {
    let finish!: (value: LocationMatch[]) => void;
    const lookup = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<LocationMatch[]>(resolve => {
            finish = resolve;
          })
      )
      .mockResolvedValue(matches);
    const service = new LocationService({ lookup });
    const pending = service.search(query);
    service.clear();
    finish(matches);
    await pending;
    await service.search(query);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
