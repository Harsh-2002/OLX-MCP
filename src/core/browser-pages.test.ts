import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Browser, Page } from 'playwright';
import { PageGate, withBrowserPage, waitForRetry } from './browser-pages.js';
import { createMockBrowser, createMockPage } from '../../tests/utils/test-helpers.js';

afterEach(() => vi.useRealTimers());

describe('bounded browser admission', () => {
  it('queues FIFO, caps the queue, and ignores duplicate releases', async () => {
    const gate = new PageGate(1, 2);
    const first = await gate.acquire();
    let secondStarted = false;
    const second = gate.acquire().then(release => {
      secondStarted = true;
      return release;
    });
    const third = gate.acquire();
    await expect(gate.acquire()).rejects.toThrow('capacity');
    expect(secondStarted).toBe(false);
    first();
    first();
    const releaseSecond = await second;
    let thirdStarted = false;
    void third.then(() => {
      thirdStarted = true;
    });
    await Promise.resolve();
    expect(thirdStarted).toBe(false);
    releaseSecond();
    (await third)();
    (await gate.acquire())();
  });

  it('removes cancelled waiters without stealing capacity', async () => {
    const gate = new PageGate(1, 1);
    const release = await gate.acquire();
    const controller = new AbortController();
    const cancelled = expect(gate.acquire(controller.signal)).rejects.toThrow('cancelled');
    controller.abort();
    await cancelled;
    const next = gate.acquire();
    release();
    (await next)();
    await expect(gate.acquire(controller.signal)).rejects.toThrow('cancelled');
  });

  it('expires queued requests and makes their slots available', async () => {
    vi.useFakeTimers();
    const gate = new PageGate(1, 1, 50);
    const release = await gate.acquire();
    const queued = expect(gate.acquire()).rejects.toThrow('capacity');
    await vi.advanceTimersByTimeAsync(50);
    await queued;
    const next = gate.acquire();
    release();
    (await next)();
  });
});

describe('page lifecycle', () => {
  it('shares a four-page limit across callers, then creates a queued page', async () => {
    const browser = createMockBrowser();
    const unblock: (() => void)[] = [];
    const work = () =>
      withBrowserPage(
        browser as unknown as Browser,
        {},
        () => new Promise<void>(resolve => unblock.push(resolve))
      );
    const calls = Array.from({ length: 5 }, work);
    await vi.waitFor(() => expect(unblock).toHaveLength(4));
    expect(browser.newPage).toHaveBeenCalledTimes(4);
    unblock[0]!();
    await calls[0];
    await vi.waitFor(() => expect(unblock).toHaveLength(5));
    unblock.slice(1).forEach(resolve => resolve());
    await Promise.all(calls);
  });

  it('closes an active page promptly on cancellation, without duplicate cleanup', async () => {
    const page = createMockPage();
    const browser = createMockBrowser({ newPage: vi.fn().mockResolvedValue(page) });
    const controller = new AbortController();
    const call = withBrowserPage(
      browser as unknown as Browser,
      {},
      () => new Promise<never>(() => {}),
      controller.signal
    );
    await vi.waitFor(() => expect(browser.newPage).toHaveBeenCalledOnce());
    const rejected = expect(call).rejects.toThrow('cancelled');
    controller.abort();
    await rejected;
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('cleans up a page whose creation completes after cancellation', async () => {
    const page = createMockPage();
    let created!: (page: unknown) => void;
    const browser = createMockBrowser({
      newPage: vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            created = resolve;
          })
      ),
    });
    const controller = new AbortController();
    const fn = vi.fn();
    const call = withBrowserPage(browser as unknown as Browser, {}, fn, controller.signal);
    await vi.waitFor(() => expect(created).toBeDefined());
    controller.abort();
    const rejected = expect(call).rejects.toThrow('cancelled');
    created(page);
    await rejected;
    expect(fn).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('releases capacity after creation, operation or close failure', async () => {
    const page = createMockPage();
    const browser = createMockBrowser({
      newPage: vi.fn().mockRejectedValueOnce(new Error('creation')).mockResolvedValue(page),
    });
    await expect(withBrowserPage(browser as unknown as Browser, {}, vi.fn())).rejects.toThrow(
      'creation'
    );
    await expect(
      withBrowserPage(browser as unknown as Browser, {}, async () => {
        throw new Error('operation');
      })
    ).rejects.toThrow('operation');
    page.close.mockRejectedValueOnce(new Error('close'));
    await expect(withBrowserPage(browser as unknown as Browser, {}, async () => 1)).rejects.toThrow(
      'close'
    );
    await expect(withBrowserPage(browser as unknown as Browser, {}, async () => 2)).resolves.toBe(
      2
    );
  });

  it('filters only SSR decorative downloads, preserving page routes and image URLs', async () => {
    const page = createMockPage();
    const browser = createMockBrowser({ newPage: vi.fn().mockResolvedValue(page) });
    await withBrowserPage(
      browser as unknown as Browser,
      { javaScriptEnabled: false },
      async () => undefined
    );
    const handler = page.route.mock.calls[0]![1] as (route: any) => Promise<void>;
    for (const type of [
      'image',
      'font',
      'media',
      'document',
      'script',
      'stylesheet',
      'xhr',
      'fetch',
    ]) {
      const route = {
        request: () => ({ resourceType: () => type }),
        abort: vi.fn(),
        fallback: vi.fn(),
      };
      await handler(route);
      expect(
        ['image', 'font', 'media'].includes(type) ? route.abort : route.fallback
      ).toHaveBeenCalledOnce();
    }
    page.route.mockClear();
    await withBrowserPage(browser as unknown as Browser, {}, async (_page: Page) => undefined);
    expect(page.route).not.toHaveBeenCalled();
  });
});

describe('retry backoff cancellation', () => {
  it('clears backoff timers immediately and handles already-cancelled requests', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const rejected = expect(waitForRetry(1000, controller.signal)).rejects.toThrow('cancelled');
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await expect(waitForRetry(1000, controller.signal)).rejects.toThrow('cancelled');
  });
  it('completes an ordinary delay', async () => {
    vi.useFakeTimers();
    const delay = waitForRetry(100);
    await vi.advanceTimersByTimeAsync(100);
    await delay;
  });
});
