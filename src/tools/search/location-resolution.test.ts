import { describe, expect, it, vi } from 'vitest';
import { LocationService } from '../../locations/location-service.js';
import { SearchListingsTool } from './search-listings.tool.js';

function setup(matches: unknown[]) {
  const scrape = vi.fn().mockResolvedValue({ success: true, data: { listings: [] } });
  const getScraper = vi.fn().mockReturnValue({ scrape });
  const lookup = vi.fn().mockResolvedValue(matches);
  const tool = new SearchListingsTool({ getScraper } as any, new LocationService({ lookup }));
  return { tool, lookup, scrape, getScraper };
}

describe('friendly location resolution at the tool boundary', () => {
  it('resolves India cities outside the alias map using a canonical live result', async () => {
    const { tool, lookup, scrape } = setup([
      { id: '1', name: 'Aluva', type: 'city', searchValue: 'aluva_g4395807' },
    ]);
    expect(
      (await tool.execute({ domain: 'olx.in', location: 'Aluva', query: 'laptop' } as any)).success
    ).toBe(true);
    expect(lookup).toHaveBeenCalledWith({ domain: 'olx.in', query: 'Aluva', limit: 50 });
    expect(scrape).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'aluva_g4395807' }),
      undefined
    );
  });
  it('preserves old India aliases and explicit canonical locations without network lookup', async () => {
    const { tool, lookup, scrape } = setup([]);
    await tool.execute({ domain: 'olx.in', location: 'Mumbai', query: 'laptop' } as any);
    await tool.execute({
      domain: 'olx.co.id',
      location: 'jakarta-selatan_g4000030',
      query: 'laptop',
    } as any);
    expect(lookup).not.toHaveBeenCalled();
    expect(scrape.mock.calls[0]![0].location).toBe('mumbai_g4058997');
  });
  it('never chooses an arbitrary city when names are ambiguous', async () => {
    const { tool, getScraper } = setup([
      { id: '1', name: 'Town', type: 'city', searchValue: 'town_g1' },
      { id: '2', name: 'Town', type: 'city', searchValue: 'town_g2' },
    ]);
    const result = await tool.execute({
      domain: 'olx.in',
      location: 'Town',
      query: 'laptop',
    } as any);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('unknown or ambiguous');
    expect(getScraper).not.toHaveBeenCalled();
  });
  it('can select an exact match among unrelated suggestions and propagates lookup failures', async () => {
    const { tool, lookup, scrape } = setup([
      { id: '1', name: 'Aluva', type: 'city', searchValue: 'aluva_g4395807' },
      { id: '2', name: 'Aluva Area', type: 'locality', searchValue: 'aluva-area_g2' },
    ]);
    await tool.execute({ domain: 'olx.in', location: 'Aluva', query: 'laptop' } as any);
    expect(scrape).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'aluva_g4395807' }),
      undefined
    );
    lookup.mockRejectedValueOnce(new Error('Network error'));
    const result = await tool.execute({
      domain: 'olx.in',
      location: 'Unknown',
      query: 'laptop',
    } as any);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe('Network error');
  });
});
