import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import { PlaywrightScraper, NonRetryableError } from './scraper.interface.js';
import { BrowserBusyError, OperationCancelledError } from '../../core/browser-pages.js';

class RetryFixture extends PlaywrightScraper<unknown, unknown> {
  constructor() {
    super({ baseUrl: 'https://www.olx.pt', timeout: 1000, retries: 3 }, {} as Browser);
  }
  async scrape() {
    return { success: true as const, data: null };
  }
  validateQuery(_query: unknown): _query is unknown {
    return true;
  }
  retry(fn: () => Promise<number>, signal?: AbortSignal) {
    return this.retryOperation(fn, undefined, signal);
  }
}
afterEach(() => vi.useRealTimers());
describe('scraper retry decisions', () => {
  it.each([
    new NonRetryableError('selector'),
    new BrowserBusyError(),
    new OperationCancelledError(),
  ])('does not retry permanent failures %s', async error => {
    const fn = vi.fn().mockRejectedValue(error);
    await expect(new RetryFixture().retry(fn)).rejects.toThrow(error.message);
    expect(fn).toHaveBeenCalledOnce();
  });
  it('does not create another page when cancelled during backoff', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error('network'));
    const rejected = expect(new RetryFixture().retry(fn, controller.signal)).rejects.toThrow(
      'cancelled'
    );
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(fn).toHaveBeenCalledOnce();
  });
  it('retries transient errors and returns success', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(42);
    const result = new RetryFixture().retry(fn);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('rejects before work if the signal was already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn();
    await expect(new RetryFixture().retry(fn, controller.signal)).rejects.toThrow('cancelled');
    expect(fn).not.toHaveBeenCalled();
  });
});
