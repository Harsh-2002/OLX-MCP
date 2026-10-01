import { expect, it, vi } from 'vitest';
import { LocationService } from '../../locations/location-service.js';
import { SearchLocationsTool } from './search-locations.tool.js';

it('validates domain and bounds, supplies defaults, and returns live location data', async () => {
  const locations = [{ id: '1', name: 'Aluva', type: 'city', searchValue: 'aluva_g4395807' }];
  const lookup = vi.fn().mockResolvedValue(locations);
  const tool = new SearchLocationsTool(new LocationService({ lookup }));
  expect(await tool.execute({ domain: 'olx.in', query: ' Aluva ' } as any)).toEqual({
    success: true,
    data: { locations },
  });
  expect(lookup).toHaveBeenCalledWith({ domain: 'olx.in', query: 'Aluva', limit: 20 });
  for (const args of [
    { domain: 'olx.pk', query: 'city' },
    { domain: 'olx.in', query: ' ' },
    { domain: 'olx.in', query: 'city', limit: 51 },
    { domain: 'olx.in', query: 'city', limit: 1.5 },
  ]) {
    expect((await tool.execute(args as any)).success).toBe(false);
  }
});
it('surfaces network errors without returning an empty city list', async () => {
  const tool = new SearchLocationsTool(
    new LocationService({ lookup: vi.fn().mockRejectedValue(new Error('OLX blocked the lookup')) })
  );
  expect(await tool.execute({ domain: 'olx.in', query: 'Aluva', limit: 20 })).toEqual({
    success: false,
    error: new Error('OLX blocked the lookup'),
  });
});
