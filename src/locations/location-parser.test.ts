import { describe, expect, it } from 'vitest';
import { canonicalLocationValue, parseLocationSuggestions } from './location-parser.js';

describe('canonical location values', () => {
  it.each([
    ['olx.in', 'https://www.olx.in/aluva_g4395807', 'aluva_g4395807'],
    ['olx.co.id', '/jakarta-selatan_g4000030', 'jakarta-selatan_g4000030'],
    [
      'olx.com.br',
      '/estado-sp/sao-paulo-e-regiao/sao-paulo',
      'estado-sp/sao-paulo-e-regiao/sao-paulo',
    ],
    ['olx.kz', '/almaty/', 'almaty'],
    ['olx.uz', '/tashkent/', 'tashkent'],
  ] as const)('accepts observed canonical paths for %s', (domain, value, expected) => {
    expect(canonicalLocationValue(domain, value)).toBe(expected);
  });
  it.each([
    'https://evil.example/mumbai_g4058997',
    'http://www.olx.in/mumbai_g4058997',
    'Mumbai',
    '../mumbai',
    '/mumbai_g4058997/items/',
    'javascript:alert(1)',
  ])('rejects noncanonical values: %s', value => {
    expect(canonicalLocationValue('olx.in', value)).toBeUndefined();
  });
});

describe('public suggestion parsing', () => {
  it('preserves parent information, native script, and duplicate city names', () => {
    expect(
      parseLocationSuggestions('olx.uz', {
        data: {
          suggestions: [
            {
              id: 1,
              name: 'Ташкент',
              slug: 'tashkent',
              type: 'CITY',
              parent_id: 9,
              state_name: 'Ташкентская область',
            },
            {
              id: 2,
              label: 'Ташкент',
              href: '/tashkent-district',
              type: 'district',
              parentId: '10',
            },
          ],
        },
      })
    ).toEqual([
      {
        id: '1',
        name: 'Ташкент',
        searchValue: 'tashkent',
        type: 'city',
        parentId: '9',
        region: 'Ташкентская область',
      },
      {
        id: '2',
        name: 'Ташкент',
        searchValue: 'tashkent-district',
        type: 'district',
        parentId: '10',
      },
    ]);
  });
  it('reads native geo-encoder city routes without collapsing districts into cities', () => {
    const city = { id: 1, name: 'Алматы', normalized_name: 'alma-ata' };
    const region = { id: 8, name: 'Алматинская область', normalized_name: 'alm' };
    expect(
      parseLocationSuggestions('olx.kz', {
        data: [
          { city, region },
          { city, region, district: { id: 2, name: 'Алмалинский район' } },
        ],
      })
    ).toEqual([
      {
        id: '1',
        name: 'Алматы',
        searchValue: 'alma-ata',
        type: 'city',
        parentId: '8',
        region: region.name,
      },
    ]);
    expect(parseLocationSuggestions('olx.kz', { data: [region] }, 'regions')).toEqual([
      { id: '8', name: region.name, searchValue: 'alm', type: 'region' },
    ]);
  });
  it('does not manufacture a slug from a name or opaque numeric ID', () => {
    expect(
      parseLocationSuggestions('olx.in', { locations: [{ id: 123, name: 'Unknown City' }] })
    ).toEqual([]);
  });
  it('deduplicates canonical values and rejects foreign links and malformed rows', () => {
    const row = { name: 'Jakarta Selatan', url: '/jakarta-selatan_g4000030' };
    expect(
      parseLocationSuggestions('olx.co.id', {
        results: [
          row,
          row,
          null,
          { name: '', slug: 'city_g123' },
          { name: 'Other', url: 'https://evil.example/city_g123' },
        ],
      })
    ).toHaveLength(1);
  });
  it('reads region and locality types from nested envelopes', () => {
    expect(
      parseLocationSuggestions('olx.in', {
        items: [
          { display_name: 'Kerala', searchValue: 'kerala_g2001160', type: 'region' },
          { name: 'Local Area', seo_url: '/area_g123', type: 'locality' },
        ],
      }).map(row => row.type)
    ).toEqual(['region', 'locality']);
    expect(parseLocationSuggestions('olx.in', 'invalid')).toEqual([]);
  });
});
