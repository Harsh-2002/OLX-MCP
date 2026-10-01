import { describe, expect, it } from 'vitest';

import { resolveOlxIndiaLocation } from './olx-india-locations.js';

describe('OLX India location resolver', () => {
  it.each([
    ['Delhi', 'delhi_g4058659'],
    ['Mumbai', 'mumbai_g4058997'],
    ['Bengaluru', 'bengaluru_g4058803'],
    ['Bangalore', 'bengaluru_g4058803'],
    ['Hyderabad', 'hyderabad_g4058526'],
    ['Chennai', 'chennai_g4059162'],
    ['Kolkata', 'kolkata_g4157275'],
    ['Pune', 'pune_g4059014'],
    ['Ahmedabad', 'ahmedabad_g4058677'],
    ['Jaipur', 'jaipur_g4059123'],
    ['Lucknow', 'lucknow_g4059306'],
    ['Chandigarh', 'chandigarh_g4058651'],
    ['Kochi', 'kochi_g4058873'],
  ])('resolves %s to the current sitemap slug', (location, expected) => {
    expect(resolveOlxIndiaLocation(location)).toBe(expected);
  });

  it('normalizes aliases and whitespace', () => {
    expect(resolveOlxIndiaLocation('  New Delhi  ')).toBe('delhi_g4058659');
    expect(resolveOlxIndiaLocation('Gurugram')).toBe('gurgaon_g4058748');
    expect(resolveOlxIndiaLocation('Prayagraj')).toBe('allahabad_g4059246');
  });

  it('corrects location IDs from the separate India prototype', () => {
    expect(resolveOlxIndiaLocation('bangalore_g4058807')).toBe('bengaluru_g4058803');
    expect(resolveOlxIndiaLocation('hyderabad_g4058863')).toBe('hyderabad_g4058526');
    expect(resolveOlxIndiaLocation('pune_g4059015')).toBe('pune_g4059014');
    expect(resolveOlxIndiaLocation('kerala_r2001158')).toBe('kerala_g2001160');
  });

  it('accepts explicit OLX location slugs for locations not yet aliased', () => {
    expect(resolveOlxIndiaLocation('pitampura_g5327792')).toBe('pitampura_g5327792');
  });

  it('rejects an unqualified location name instead of building an unfiltered URL', () => {
    expect(() => resolveOlxIndiaLocation('Some Smaller City')).toThrow(
      'Unknown OLX India location'
    );
  });
});
