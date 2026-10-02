import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import {
  ImageDownloader,
  MAX_IMAGE_BYTES,
  assertPublicAddress,
  validateImageUrl,
  imageMimeType,
} from './image-downloader.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
type Plan = {
  status?: number;
  location?: string;
  length?: number;
  chunks?: Buffer[];
  error?: string;
  aborted?: boolean;
};
let plans: Plan[];
beforeEach(() => {
  plans = [];
  vi.mocked(lookup).mockResolvedValue([{ address: '1.1.1.1', family: 4 }] as any);
  vi.mocked(request).mockImplementation(((_url: unknown, options: any, callback: any) => {
    const req = new EventEmitter() as any;
    req.end = () =>
      globalThis.queueMicrotask(() => {
        const plan = plans.shift() ?? {};
        const res = new EventEmitter() as any;
        res.statusCode = plan.status ?? 200;
        res.headers = { location: plan.location, 'content-length': plan.length };
        res.resume = vi.fn();
        res.destroy = vi.fn();
        options.lookup('host', {}, (error: unknown, address: string, family: number) => {
          expect(error).toBeNull();
          expect(address).toBe('1.1.1.1');
          expect(family).toBe(4);
        });
        callback(res);
        globalThis.queueMicrotask(() => {
          if (plan.error) res.emit('error', new Error(plan.error));
          else if (plan.aborted) res.emit('aborted');
          else {
            for (const chunk of plan.chunks ?? [png]) res.emit('data', chunk);
            res.emit('end');
          }
        });
      });
    return req;
  }) as any);
});
afterEach(() => vi.useRealTimers());

describe('image host boundary', () => {
  it.each([
    'http://apollo.olxcdn.com/a.jpg',
    'https://example.com/a.jpg',
    'https://olxcdn.com.evil.test/a',
    'https://u:p@apollo.olxcdn.com/a',
    'https://apollo.olxcdn.com:444/a',
    'https://127.0.0.1/a',
    'file:///etc/passwd',
  ])('rejects %s', url => expect(() => validateImageUrl(url)).toThrow());
  it.each([
    'https://apollo.olx.in/a',
    'https://ireland.apollo.olxcdn.com/a',
    'https://images.olx.ua/a',
  ])('accepts OLX CDN %s', url => expect(validateImageUrl(url).protocol).toBe('https:'));
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'garbage',
  ])('rejects non-public address %s', address =>
    expect(() => assertPublicAddress(address)).toThrow()
  );
  it.each(['8.8.8.8', '2606:4700:4700::1111'])('accepts public address %s', address =>
    expect(() => assertPublicAddress(address)).not.toThrow()
  );
  it('rejects any private DNS answer before connecting', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ] as any);
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow(
      'non-public'
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe('bounded image downloads', () => {
  it('returns actual bytes, detected MIME and source URL', async () => {
    const image = await new ImageDownloader().download('https://apollo.olxcdn.com/a');
    expect(Buffer.from(image.data, 'base64')).toEqual(png);
    expect(image.mimeType).toBe('image/png');
    expect(image.byteLength).toBe(png.length);
  });
  it('validates redirects and pins DNS again', async () => {
    plans = [{ status: 302, location: '/b' }, { chunks: [png] }];
    const image = await new ImageDownloader().download('https://apollo.olxcdn.com/a');
    expect(image.url).toBe('https://apollo.olxcdn.com/b');
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it('rejects redirects away from OLX hosts', async () => {
    plans = [{ status: 302, location: 'https://localhost/private' }];
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow(
      'OLX image host'
    );
  });
  it('bounds redirect loops', async () => {
    plans = Array.from({ length: 4 }, () => ({ status: 302, location: '/a' }));
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow(
      'Too many'
    );
  });
  it('rejects a redirect without a destination', async () => {
    plans = [{ status: 302 }];
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow(
      'missing destination'
    );
  });
  it.each([
    { status: 403 },
    { length: MAX_IMAGE_BYTES + 1 },
    { chunks: [Buffer.alloc(MAX_IMAGE_BYTES), Buffer.alloc(1)] },
    { error: 'broken response' },
    { aborted: true },
    { chunks: [Buffer.from('<html>not an image</html>')] },
  ])('rejects failed, oversized or non-image responses %j', async plan => {
    plans = [plan];
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow();
  });
  it('bounds DNS lookup by the absolute download deadline', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    vi.mocked(lookup).mockImplementation(() => new Promise(() => {}) as any);
    const rejected = expect(
      new ImageDownloader().download('https://apollo.olxcdn.com/a')
    ).rejects.toThrow('timed out');
    deadline.abort();
    await rejected;
  });
  it('cancels during DNS lookup and before a download', async () => {
    vi.mocked(lookup).mockImplementation(() => new Promise(() => {}) as any);
    const controller = new AbortController();
    const rejected = expect(
      new ImageDownloader().download('https://apollo.olxcdn.com/a', controller.signal)
    ).rejects.toThrow('cancelled');
    controller.abort();
    await rejected;
    await expect(
      new ImageDownloader().download('https://apollo.olxcdn.com/a', controller.signal)
    ).rejects.toThrow('cancelled');
  });
  it('surfaces request failures', async () => {
    vi.mocked(request).mockImplementation((() => {
      throw new Error('connect');
    }) as any);
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow(
      'connect'
    );
  });
  it('rejects empty DNS results', async () => {
    vi.mocked(lookup).mockResolvedValue([] as any);
    await expect(new ImageDownloader().download('https://apollo.olxcdn.com/a')).rejects.toThrow(
      'no addresses'
    );
  });
  it.each([
    [Buffer.from([255, 216, 255]), 'image/jpeg'],
    [Buffer.from('GIF89a'), 'image/gif'],
    [Buffer.from('RIFF1234WEBP'), 'image/webp'],
  ])('recognizes supported file signatures', (bytes, mime) =>
    expect(imageMimeType(bytes as Buffer)).toBe(mime)
  );
});
