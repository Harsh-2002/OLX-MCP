import { describe, expect, it, vi } from 'vitest';
import type { Browser, Response } from 'playwright';
import { BrowserLocationProvider } from './browser-location-provider.js';
import type { LocationQuery } from './types.js';

function setup(domain: LocationQuery['domain'] = 'olx.in') {
  let respond: (response: Response) => void = () => {};
  let url = `https://www.${domain}`;
  const input = {
    click: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(1),
    fill: vi.fn().mockResolvedValue(undefined),
  };
  const opener = { count: vi.fn().mockResolvedValue(0), click: vi.fn() };
  const page = {
    goto: vi.fn().mockImplementation(async (next: string) => {
      url = next;
      return { status: () => 200 };
    }),
    title: vi.fn().mockResolvedValue('OLX'),
    setDefaultTimeout: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    url: () => url,
    locator: vi
      .fn()
      .mockImplementation(selector =>
        selector.includes('btnSearch')
          ? { first: () => opener }
          : selector.includes('[role="option"]')
            ? { count: vi.fn().mockResolvedValue(0) }
            : { first: () => input }
      ),
    getByRole: vi.fn().mockReturnValue({ first: () => opener }),
    getByText: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForResponse: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((_event: string, callback: typeof respond) => {
      respond = callback;
    }),
    off: vi.fn(),
    $$eval: vi.fn().mockResolvedValue([]),
  };
  const browser = { newPage: vi.fn().mockResolvedValue(page) };
  const emit = (payload: unknown, overrides: Partial<Response> = {}) =>
    respond({
      url: () => `https://www.${domain}/location-suggestions`,
      ok: () => true,
      headers: () => ({ 'content-type': 'application/json' }),
      json: async () => payload,
      ...overrides,
    } as Response);
  return {
    page,
    input,
    opener,
    emit,
    setUrl: (next: string) => {
      url = next;
    },
    provider: new BrowserLocationProvider(browser as unknown as Browser),
  };
}

describe('live public location provider', () => {
  it.each([
    ['olx.in', 'Aluva', 'aluva_g4395807'],
    ['olx.co.id', 'Jakarta Selatan', 'jakarta-selatan_g4000030'],
    ['olx.com.br', 'São Paulo', 'estado-sp/sao-paulo-e-regiao/sao-paulo'],
    ['olx.kz', 'Алматы', 'almaty'],
    ['olx.uz', 'Ташкент', 'tashkent'],
  ] as const)('uses browser-observed public canonical values on %s', async (domain, name, slug) => {
    const { provider, input, emit, page } = setup(domain);
    input.fill.mockImplementation(async () => {
      emit({ suggestions: [{ id: 'city', name, slug, parent_id: 'region' }] });
    });
    const locations = await provider.lookup({ domain, query: name, parentId: 'region', limit: 20 });
    expect(locations).toEqual([
      { id: 'city', name, searchValue: slug, type: 'city', parentId: 'region' },
    ]);
    expect(page.off).toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('selects opaque suggestions and reads the canonical route supplied by the UI', async () => {
    const { provider, page, input, opener, setUrl } = setup();
    const option = {
      click: vi.fn().mockResolvedValue(undefined),
    };
    opener.count.mockResolvedValue(1);
    opener.click.mockImplementation(async () =>
      setUrl('https://www.olx.in/aluva_g4395807/items/q-laptop')
    );
    const matched = { count: vi.fn().mockResolvedValue(1), first: () => option };
    const options = {
      count: vi.fn().mockResolvedValue(1),
      allTextContents: vi.fn().mockResolvedValue(['Aluva']),
      filter: vi.fn().mockReturnValue(matched),
    };
    page.locator.mockImplementation(selector =>
      selector.includes('btnSearch')
        ? { first: () => opener }
        : selector.includes('[role="option"]')
          ? options
          : { first: () => input }
    );
    Object.assign(page, { waitForURL: vi.fn().mockResolvedValue(undefined) });
    expect(await provider.lookup({ domain: 'olx.in', query: 'Aluva', limit: 1 })).toEqual([
      { id: 'aluva_g4395807', name: 'Aluva', type: 'city', searchValue: 'aluva_g4395807' },
    ]);
    expect(page.locator).toHaveBeenCalledWith('[data-aut-id="btnSearch"]:visible');
    expect(opener.click).toHaveBeenCalledOnce();
    expect(options.filter).toHaveBeenCalledWith({ hasText: /^\s*Aluva\s*$/ });
    const labelFilter = options.filter.mock.calls[0]?.[0].hasText as RegExp;
    expect(labelFilter.test(' Aluva ')).toBe(true);
    expect(labelFilter.test('Another Aluva')).toBe(false);
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('waits for native autocomplete rather than unrelated location requests', async () => {
    const { provider, input, page, emit } = setup();
    input.fill.mockImplementation(async () =>
      emit({ suggestions: [{ name: 'Aluva', slug: 'aluva_g4395807' }] })
    );
    await provider.lookup({ domain: 'olx.in', query: 'Aluva', limit: 1 });
    const predicate = page.waitForResponse.mock.calls[0]?.[0] as unknown as (
      response: Response
    ) => boolean;
    const response = (path: string) =>
      ({
        url: () => `https://www.olx.in${path}`,
        ok: () => true,
        headers: () => ({ 'content-type': 'application/json' }),
      }) as Response;
    expect(predicate(response('/api/locations/4395807/path'))).toBe(false);
    expect(predicate(response('/api/locations/autocomplete?input=Aluva'))).toBe(true);
  });

  it('reads native geo-encoder response metadata', async () => {
    const { provider, page, input, emit } = setup('olx.kz');
    input.fill.mockImplementation(async () =>
      emit({
        data: [
          {
            city: { id: 1, name: 'Алматы', normalized_name: 'alma-ata' },
            region: { id: 8, name: 'Алматинская область' },
          },
        ],
      })
    );
    expect(
      await provider.lookup({ domain: 'olx.kz', query: 'Алматы', parentId: '8', limit: 1 })
    ).toEqual([
      {
        id: '1',
        name: 'Алматы',
        type: 'city',
        searchValue: 'alma-ata',
        parentId: '8',
        region: 'Алматинская область',
      },
    ]);
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('retries once when a server-rendered input ignored the first fill before hydration', async () => {
    const { provider, input, page, emit } = setup('olx.kz');
    input.fill.mockImplementation(async () => {
      if (input.fill.mock.calls.length === 3)
        emit({ data: [{ city: { id: 1, name: 'Алматы', normalized_name: 'alma-ata' } }] });
    });
    expect(
      (await provider.lookup({ domain: 'olx.kz', query: 'Алматы', limit: 1 }))[0]?.searchValue
    ).toBe('alma-ata');
    expect(page.waitForResponse).toHaveBeenCalledTimes(2);
    expect(input.click).toHaveBeenCalledOnce();
    expect(input.fill.mock.calls.map(call => call[0])).toEqual(['Алматы', '', 'Алматы']);
  });

  it('waits for delayed autocomplete and prioritizes a city over an initial region option', async () => {
    const { provider, input, page, emit } = setup('olx.uz');
    let complete!: () => void;
    page.waitForResponse.mockImplementation(
      () =>
        new Promise(resolve => {
          complete = () => resolve(undefined);
        })
    );
    input.fill.mockImplementation(async () => {
      emit(
        { data: [{ id: 5, name: 'Ташкентская область', normalized_name: 'toshkent-oblast' }] },
        { url: () => 'https://www.olx.uz/api/v1/geo-encoder/regions/' }
      );
      setTimeout(() => {
        emit({
          data: [
            {
              city: { id: 4, name: 'Ташкент', normalized_name: 'tashkent' },
              region: { id: 5, name: 'Ташкентская область' },
            },
          ],
        });
        complete();
      }, 10);
    });
    const result = await provider.lookup({ domain: 'olx.uz', query: 'Ташкент', limit: 1 });
    expect(result[0]?.searchValue).toBe('tashkent');
    const predicate = page.waitForResponse.mock.calls[0]?.[0] as unknown as (
      response: Response
    ) => boolean;
    const response = (url: string) =>
      ({
        url: () => url,
        ok: () => true,
        headers: () => ({ 'content-type': 'application/json' }),
      }) as Response;
    expect(predicate(response('https://www.olx.uz/api/v1/geo-encoder/regions/'))).toBe(false);
    expect(
      predicate(
        response('https://www.olx.uz/api/v1/geo-encoder/location-autocomplete/?query=Other')
      )
    ).toBe(false);
    expect(predicate(response('https://other.example/location-suggestions'))).toBe(false);
    expect(
      predicate(
        response('https://www.olx.uz/api/v1/geo-encoder/location-autocomplete/?query=Ташкент')
      )
    ).toBe(true);
  });

  it('uses canonical directory links when the legacy picker is absent', async () => {
    const { provider, input, page } = setup();
    input.count.mockResolvedValue(0);
    page.$$eval.mockResolvedValue([{ name: 'Aluva', value: '/aluva_g4395807', location: false }]);
    expect(await provider.lookup({ domain: 'olx.in', query: 'Aluva', limit: 1 })).toHaveLength(1);
    expect(page.goto).toHaveBeenLastCalledWith(
      'https://www.olx.in/sitemap/cities',
      expect.anything()
    );
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('rejects blocked pages and still closes resources', async () => {
    const { provider, page } = setup('olx.kz');
    page.goto.mockResolvedValue({ status: () => 403 });
    await expect(provider.lookup({ domain: 'olx.kz', query: 'Алматы', limit: 1 })).rejects.toThrow(
      'HTTP 403'
    );
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('does not turn a missing picker or incomplete directory into a guessed result', async () => {
    const { provider, input, page } = setup('olx.uz');
    input.count.mockResolvedValue(0);
    await expect(provider.lookup({ domain: 'olx.uz', query: 'Unknown', limit: 1 })).rejects.toThrow(
      'no location has been guessed'
    );
    expect(page.close).toHaveBeenCalledOnce();
    const legacy = setup();
    legacy.input.count.mockResolvedValue(0);
    await expect(
      legacy.provider.lookup({ domain: 'olx.in', query: 'Unknown', limit: 1 })
    ).rejects.toThrow('recognized location links');
  });

  it('opens the Brazil picker before filling its input', async () => {
    const { provider, input, opener, page } = setup('olx.com.br');
    input.count.mockResolvedValueOnce(0).mockResolvedValue(1);
    opener.count.mockResolvedValue(1);
    page.$$eval.mockResolvedValue([
      { name: 'São Paulo', value: '/estado-sp/sao-paulo-e-regiao/sao-paulo', location: true },
    ]);
    expect(
      await provider.lookup({ domain: 'olx.com.br', query: 'São Paulo', limit: 1 })
    ).toHaveLength(1);
    expect(opener.click).toHaveBeenCalledOnce();
  });

  it('returns an empty result only when the picker explicitly confirms none', async () => {
    const { provider, page, input, emit } = setup('olx.kz');
    input.fill.mockImplementation(async () => {
      emit({ suggestions: [] });
      emit(
        { suggestions: [{ name: 'Bad', slug: 'bad' }] },
        { url: () => 'https://evil.example/location-suggestions' }
      );
      emit({}, { ok: () => false });
      emit({}, { headers: () => ({ 'content-type': 'text/html' }) });
      emit({}, { url: () => 'https://www.olx.kz/advertising' });
      emit(
        {},
        {
          json: async () => {
            throw new Error('invalid JSON');
          },
        }
      );
    });
    page.getByText.mockReturnValue({ count: vi.fn().mockResolvedValue(1) });
    expect(await provider.lookup({ domain: 'olx.kz', query: 'Missing', limit: 1 })).toEqual([]);
  });

  it('filters, deduplicates and limits directory results without inventing parents', async () => {
    const { provider, input, page } = setup();
    input.count.mockResolvedValue(0);
    page.$$eval.mockResolvedValue([
      { name: 'Town', value: '/town_g1', location: false },
      { name: 'Town', value: '/town_g1', location: false },
      { name: 'Town Two', value: '/town-two_g2', location: false },
      { name: 'Other', value: '/other_g3', location: false },
      { name: 'Bad', value: 'https://evil.example/bad_g4', location: false },
    ]);
    expect(await provider.lookup({ domain: 'olx.in', query: 'Town', limit: 1 })).toHaveLength(1);
    await expect(
      provider.lookup({ domain: 'olx.in', query: 'Town', parentId: 'unknown', limit: 20 })
    ).rejects.toThrow('may not cover all localities');
  });

  it('rejects links from a page redirected to a different host', async () => {
    const { provider, page } = setup('olx.kz');
    page.goto.mockImplementation(async () => ({ status: () => 200 }));
    Object.assign(page, { url: () => 'https://other.example/' });
    page.$$eval.mockResolvedValue([{ name: 'Алматы', value: '/alma-ata/', location: true }]);
    await expect(provider.lookup({ domain: 'olx.kz', query: 'Алматы', limit: 1 })).rejects.toThrow(
      'canonical location data'
    );
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('does not treat ordinary European homepage category links as city suggestions', async () => {
    const { provider, page } = setup('olx.kz');
    page.$$eval.mockResolvedValue([{ name: 'Transport', value: '/transport/', location: false }]);
    await expect(
      provider.lookup({ domain: 'olx.kz', query: 'Transport', limit: 1 })
    ).rejects.toThrow('canonical location data');
  });
});
