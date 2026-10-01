import { expect, it, vi } from 'vitest';
import type { Page, Response } from 'playwright';
import { assertPageAccessible } from './page-status.js';

it.each([403, 404, 429, 503])(
  'rejects HTTP %s without treating it as an empty result',
  async status => {
    await expect(
      assertPageAccessible(
        { title: vi.fn() } as unknown as Page,
        { status: () => status } as Response
      )
    ).rejects.toThrow(`HTTP ${status}`);
  }
);
it.each(['Human Verification', 'Access Denied', 'Just a moment', 'CAPTCHA'])(
  'detects a 200 verification page: %s',
  async title => {
    await expect(
      assertPageAccessible({ title: async () => title } as Page, { status: () => 200 } as Response)
    ).rejects.toThrow('verification page');
  }
);
it('allows a regular page, including a null navigation response', async () => {
  await expect(
    assertPageAccessible({ title: async () => 'OLX listings' } as Page, null)
  ).resolves.toBeUndefined();
});
