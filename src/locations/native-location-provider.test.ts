import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from 'node:http2';
import {
  fetchLocationJson,
  NativeLocationProvider,
  OlxLocationProvider,
} from './native-location-provider.js';

vi.mock('node:http2', () => ({ connect: vi.fn() }));

describe('native location API transport', () => {
  let stream: EventEmitter & {
    end: ReturnType<typeof vi.fn>;
    setEncoding: ReturnType<typeof vi.fn>;
  };
  let session: EventEmitter & {
    request: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  const url = new URL('https://www.olx.in/api/locations/autocomplete?input=Aluva&limit=5');
  beforeEach(() => {
    stream = Object.assign(new EventEmitter(), { end: vi.fn(), setEncoding: vi.fn() });
    session = Object.assign(new EventEmitter(), {
      request: vi.fn().mockReturnValue(stream),
      destroy: vi.fn(),
    });
    vi.mocked(connect).mockReturnValue(session as never);
  });
  afterEach(() => vi.useRealTimers());
  it('uses HTTP/2 and honest identification, reads JSON, and closes its session', async () => {
    const pending = fetchLocationJson(url);
    stream.emit('response', { ':status': 200, 'content-type': 'application/json; charset=utf-8' });
    stream.emit('data', '{"data":');
    stream.emit('data', '{"suggestions":[]}}');
    stream.emit('end');
    expect(await pending).toEqual({ data: { suggestions: [] } });
    expect(connect).toHaveBeenCalledWith(url.origin);
    expect(session.request).toHaveBeenCalledWith(
      expect.objectContaining({
        ':path': url.pathname + url.search,
        'user-agent': expect.stringContaining('OLX-MCP/'),
      })
    );
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it.each([403, 302, 500])('rejects HTTP %s without following redirects', async status => {
    const pending = fetchLocationJson(url);
    const rejected = expect(pending).rejects.toThrow(`HTTP ${status}`);
    stream.emit('response', { ':status': status });
    await rejected;
    stream.emit('end');
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it('rejects HTML challenge responses', async () => {
    const pending = fetchLocationJson(url);
    const rejected = expect(pending).rejects.toThrow('non-JSON');
    stream.emit('response', { ':status': 200, 'content-type': 'text/html' });
    await rejected;
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it('rejects invalid JSON and oversized bodies', async () => {
    for (const [body, error] of [
      ['{broken', 'invalid JSON'],
      ['x'.repeat(1048577), '1 MiB'],
    ]) {
      const pending = fetchLocationJson(url);
      const rejected = expect(pending).rejects.toThrow(error);
      stream.emit('data', body);
      stream.emit('end');
      await rejected;
    }
    expect(session.destroy).toHaveBeenCalledTimes(2);
  });
  it.each(['session', 'stream'])('closes the session on a %s error', async source => {
    const pending = fetchLocationJson(url);
    const rejected = expect(pending).rejects.toThrow('Connection reset');
    (source === 'session' ? session : stream).emit('error', new Error('Connection reset'));
    await rejected;
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it('cleans up when opening a request fails synchronously', async () => {
    session.request.mockImplementation(() => {
      throw new Error('Session closed');
    });
    await expect(fetchLocationJson(url)).rejects.toThrow('Session closed');
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it.each(['close', 'aborted'])('rejects a premature %s event and cleans up', async event => {
    const pending = fetchLocationJson(url);
    const rejected = expect(pending).rejects.toThrow(
      event === 'close' ? 'connection closed' : 'aborted'
    );
    (event === 'close' ? session : stream).emit(event);
    await rejected;
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it('bounds the entire operation even when the server never ends its response', async () => {
    vi.useFakeTimers();
    const pending = fetchLocationJson(url);
    const rejected = expect(pending).rejects.toThrow('15-second deadline');
    stream.emit('data', '{');
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(session.destroy).toHaveBeenCalledOnce();
  });
});

describe('native location lookup', () => {
  const city = {
    id: 4395807,
    name: 'Aluva',
    type: 'CITY',
    parentId: 2001160,
    addressComponents: [{ type: 'STATE', name: 'Kerala' }],
  };
  it('returns genuine IDs, verified numeric routes, parents, and region metadata', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: { suggestions: [city] } });
    const provider = new NativeLocationProvider(fetch);
    expect(await provider.lookup({ domain: 'olx.in', query: 'Aluva', limit: 5 })).toEqual([
      {
        id: '4395807',
        name: 'Aluva',
        type: 'city',
        parentId: '2001160',
        region: 'Kerala',
        searchValue: '_g4395807',
      },
    ]);
    expect(fetch.mock.calls[0]![0].hostname).toBe('www.olx.in');
    expect(fetch.mock.calls[0]![0].searchParams.get('input')).toBe('Aluva');
  });
  it('preserves duplicate names for disambiguation and supports parent filtering', async () => {
    const provider = new NativeLocationProvider(async () => ({
      data: {
        suggestions: [
          { ...city, id: 1, name: 'Aluva East' },
          city,
          { ...city, id: 2, parentId: 3 },
        ],
      },
    }));
    const query = { domain: 'olx.co.id' as const, query: 'Aluva', limit: 3 };
    expect((await provider.lookup(query)).map(row => row.id)).toEqual(['4395807', '2', '1']);
    expect((await provider.lookup({ ...query, parentId: '3' })).map(row => row.id)).toEqual(['2']);
    expect(await provider.lookup({ ...query, parentId: '99' })).toEqual([]);
  });
  it('requests broader suggestions before applying parent filtering and the output limit', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ data: { suggestions: [city, { ...city, id: 2, parentId: 3 }] } });
    const rows = await new NativeLocationProvider(fetch).lookup({
      domain: 'olx.in',
      query: 'Aluva',
      parentId: '3',
      limit: 1,
    });
    expect(fetch.mock.calls[0]![0].searchParams.get('limit')).toBe('50');
    expect(rows.map(row => row.id)).toEqual(['2']);
  });
  it('distinguishes explicit empty suggestions from malformed data', async () => {
    expect(
      await new NativeLocationProvider(async () => ({ data: { suggestions: [] } })).lookup({
        domain: 'olx.in',
        query: 'Missing',
        limit: 1,
      })
    ).toEqual([]);
    for (const payload of [
      null,
      {},
      { data: { suggestions: [{ id: -1, name: 'Aluva', type: 'CITY' }] } },
    ]) {
      await expect(
        new NativeLocationProvider(async () => payload).lookup({
          domain: 'olx.in',
          query: 'Aluva',
          limit: 1,
        })
      ).rejects.toThrow('Live location lookup failed');
    }
  });
  it('rejects unconfigured domains and reports upstream failures', async () => {
    await expect(
      new NativeLocationProvider().lookup({ domain: 'olx.kz', query: 'Алматы', limit: 1 })
    ).rejects.toThrow('No native location API');
    await expect(
      new NativeLocationProvider(async () => {
        throw new Error('HTTP 403');
      }).lookup({ domain: 'olx.in', query: 'Aluva', limit: 1 })
    ).rejects.toThrow('HTTP 403');
  });
  it('dispatches native sites to HTTP/2 and other sites to their browser provider', async () => {
    const browser = { lookup: vi.fn().mockResolvedValue([]) };
    const native = { lookup: vi.fn().mockResolvedValue([]) };
    const provider = new OlxLocationProvider(browser, native);
    for (const domain of ['olx.in', 'olx.co.id', 'olx.kz', 'olx.uz'] as const)
      await provider.lookup({ domain, query: 'City', limit: 1 });
    expect(native.lookup).toHaveBeenCalledTimes(2);
    expect(browser.lookup).toHaveBeenCalledTimes(2);
  });
});
