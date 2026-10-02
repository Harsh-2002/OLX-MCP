import { Browser, Page } from 'playwright';
import {
  withBrowserPage,
  waitForRetry,
  OperationCancelledError,
  BrowserBusyError,
} from '../../core/browser-pages.js';
import { Result, ScraperConfig } from '../../core/types.js';

export interface IScraper<TQuery, TResult> {
  scrape(query: TQuery, signal?: AbortSignal): Promise<Result<TResult>>;
  validateQuery(query: unknown): query is TQuery;
}

/**
 * A failure that repeating the operation cannot fix — a stale selector will be
 * just as stale on the third page load. retryOperation surfaces these
 * immediately instead of spending the full backoff schedule on them.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export abstract class PlaywrightScraper<TQuery, TResult> implements IScraper<TQuery, TResult> {
  constructor(
    protected readonly config: ScraperConfig,
    protected readonly browser: Browser
  ) {}

  abstract scrape(query: TQuery, signal?: AbortSignal): Promise<Result<TResult>>;
  abstract validateQuery(query: unknown): query is TQuery;

  protected async withPage<T>(
    fn: (page: Page) => Promise<T>,
    signal?: AbortSignal,
    options: { javaScriptEnabled?: boolean } = {}
  ): Promise<T> {
    const newPageOptions: Parameters<typeof this.browser.newPage>[0] = { ...options };
    if (this.config.userAgent) {
      newPageOptions.userAgent = this.config.userAgent;
    }
    return withBrowserPage(
      this.browser,
      newPageOptions,
      async page => {
        page.setDefaultTimeout(this.config.timeout);
        return fn(page);
      },
      signal
    );
  }

  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.retries,
    signal?: AbortSignal
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new OperationCancelledError();
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (signal?.aborted) throw new OperationCancelledError();
        if (
          lastError instanceof NonRetryableError ||
          lastError instanceof OperationCancelledError ||
          lastError instanceof BrowserBusyError ||
          attempt === maxRetries
        ) {
          throw lastError;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await waitForRetry(delay, signal);
      }
    }

    throw lastError!;
  }
}
