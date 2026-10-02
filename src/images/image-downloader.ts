import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { OLX_DOMAINS } from '../core/domains.js';
import { OperationCancelledError } from '../core/browser-pages.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export type DownloadedImage = { url: string; mimeType: string; data: string; byteLength: number };

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('::', 96, 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addSubnet('ff00::', 8, 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');

const publicIPv6 = new BlockList();
publicIPv6.addSubnet('2000::', 3, 'ipv6');

export function assertPublicAddress(address: string): void {
  const family = isIP(address);
  if (
    !family ||
    (family === 6 && !publicIPv6.check(address, 'ipv6')) ||
    blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')
  )
    throw new Error('Image host resolved to a non-public address');
}

export function validateImageUrl(value: string): URL {
  const url = new URL(value);
  const domains = [...OLX_DOMAINS, 'olxcdn.com'];
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  )
    throw new Error('Image URL must use HTTPS on an OLX image host');
  return url;
}

export function imageMimeType(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  throw new Error('Unsupported image format; expected JPEG, PNG, WebP or GIF');
}

/** Bounded downloads of gallery URLs only; DNS is validated and pinned for every redirect. */
export class ImageDownloader {
  async download(value: string, signal?: AbortSignal): Promise<DownloadedImage> {
    const deadline = AbortSignal.timeout(15000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      const { bytes, url } = await this.fetch(validateImageUrl(value), combined, 0);
      return {
        url: url.toString(),
        mimeType: imageMimeType(bytes),
        data: bytes.toString('base64'),
        byteLength: bytes.length,
      };
    } catch (error) {
      if (signal?.aborted) throw new OperationCancelledError();
      if (deadline.aborted) throw new Error('Image download timed out');
      throw error;
    }
  }

  private async fetch(
    url: URL,
    signal: AbortSignal,
    redirects: number
  ): Promise<{ bytes: Buffer; url: URL }> {
    signal.throwIfAborted();
    const addresses = await new Promise<{ address: string; family: number }[]>(
      (resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        lookup(url.hostname, { all: true })
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
      }
    );
    signal.throwIfAborted();
    if (!addresses.length) throw new Error('Image host has no addresses');
    addresses.forEach(({ address }) => assertPublicAddress(address));
    const address = addresses.find(candidate => candidate.family === 4) ?? addresses[0]!;
    return new Promise((resolve, reject) => {
      let discarded = false;
      const req = request(
        url,
        {
          signal,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' },
        },
        res => {
          res.on('error', error => {
            if (!discarded) reject(error);
          });
          res.on('aborted', () => {
            if (!discarded) reject(new Error('Image response was interrupted'));
          });
          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
            discarded = true;
            res.destroy();
            if (!res.headers.location || redirects >= 3) {
              reject(new Error('Too many image redirects or missing destination'));
              return;
            }
            try {
              const target = validateImageUrl(new URL(res.headers.location, url).toString());
              this.fetch(target, signal, redirects + 1).then(resolve, reject);
            } catch (error) {
              reject(error);
            }
            return;
          }
          if (res.statusCode !== 200) {
            discarded = true;
            res.destroy();
            reject(new Error(`Image host returned HTTP ${res.statusCode}`));
            return;
          }
          if (Number(res.headers['content-length']) > MAX_IMAGE_BYTES) {
            reject(new Error('Image exceeds the 2 MiB download limit'));
            res.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_IMAGE_BYTES) {
              reject(new Error('Image exceeds the 2 MiB download limit'));
              res.destroy();
            } else chunks.push(chunk);
          });
          res.on('end', () => resolve({ bytes: Buffer.concat(chunks), url }));
        }
      );
      req.on('error', error => {
        if (!discarded) reject(error);
      });
      req.end();
    });
  }
}
