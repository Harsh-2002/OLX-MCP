import type { Browser, Page } from 'playwright';

export class OperationCancelledError extends Error {
  constructor() {
    super('Operation cancelled');
    this.name = 'OperationCancelledError';
  }
}

export class BrowserBusyError extends Error {
  constructor() {
    super('Browser capacity exceeded; retry the request later');
    this.name = 'BrowserBusyError';
  }
}

type Waiter = { grant: () => void; cancel: () => void };

/** FIFO admission shared by every scraper and location picker using a browser. */
export class PageGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly capacity = 4,
    private readonly queueLimit = 32,
    private readonly waitMs = 30000
  ) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new OperationCancelledError();
    if (this.active < this.capacity) {
      this.active++;
      return this.releaseOnce();
    }
    if (this.waiting.length >= this.queueLimit) throw new BrowserBusyError();
    return new Promise((resolve, reject) => {
      const remove = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
      };
      const abort = () => {
        remove();
        reject(new OperationCancelledError());
      };
      const timer = setTimeout(() => {
        remove();
        reject(new BrowserBusyError());
      }, this.waitMs);
      const waiter: Waiter = {
        grant: () => {
          remove();
          resolve(this.releaseOnce());
        },
        cancel: abort,
      };
      this.waiting.push(waiter);
      signal?.addEventListener('abort', waiter.cancel, { once: true });
    });
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting[0];
      if (next) next.grant();
      else this.active--;
    };
  }
}

const gates = new WeakMap<Browser, PageGate>();

/** Close a cancelled page, and hold admission until page creation and cleanup finish. */
export async function withBrowserPage<T>(
  browser: Browser,
  options: Parameters<Browser['newPage']>[0],
  fn: (page: Page) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  let gate = gates.get(browser);
  if (!gate) {
    gate = new PageGate();
    gates.set(browser, gate);
  }
  const release = await gate.acquire(signal);
  let page: Page | undefined;
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= page!.close());
  let abort: (() => void) | undefined;
  try {
    if (signal?.aborted) throw new OperationCancelledError();
    page = await browser.newPage(options);
    if (signal?.aborted) throw new OperationCancelledError();
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => {
        void close().catch(() => {});
        reject(new OperationCancelledError());
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
    const work = async () => {
      // SSR pages expose text and URLs without downloading decorative assets.
      // Keep scripts, styles and all dynamic-site resources unchanged.
      if (options?.javaScriptEnabled === false) {
        await page!.route('**/*', route =>
          ['image', 'font', 'media'].includes(route.request().resourceType())
            ? route.abort()
            : route.fallback()
        );
      }
      return fn(page!);
    };
    return await Promise.race([work(), cancelled]);
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
    try {
      if (page) await close();
    } finally {
      release();
    }
  }
}

export async function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new OperationCancelledError();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new OperationCancelledError());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
