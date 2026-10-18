import { DeliveryError } from './domain.js';
import type { NotificationChannel } from './domain.js';
import { fetchFeed, FeedReadError } from './feed.js';
import type { FetchFunction } from './feed.js';
import type { CatalogStore } from './store.js';

export interface PollerOptions {
  readonly store: CatalogStore;
  readonly channels: readonly NotificationChannel[];
  readonly fetch?: FetchFunction;
  readonly now?: () => Date;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly maxFeedBytes?: number;
  readonly maxFeedsPerTick?: number;
  readonly maxDeliveriesPerTick?: number;
  readonly onError?: (error: unknown) => void;
}
export interface Poller { tick(): Promise<void>; start(): void; stop(): Promise<void> }
export function createPoller(options: PollerOptions): Poller {
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetch ?? globalThis.fetch;
  const interval = options.pollIntervalMs ?? 60_000;
  const timeout = options.requestTimeoutMs ?? 10_000;
  if (!Number.isFinite(interval) || interval < 1000 || !Number.isFinite(timeout) || timeout < 1 || timeout > 120_000) throw new Error('Invalid polling interval or timeout');
  const channels = new Map(options.channels.map((channel) => [channel.kind, channel]));
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  async function work(): Promise<void> {
    for (const feed of options.store.dueFeeds(now(), options.maxFeedsPerTick ?? 20)) {
      try {
        const items = await fetchFeed(feed.url, fetcher, { timeoutMs: timeout, maxBytes: options.maxFeedBytes ?? 2 * 1024 * 1024 });
        options.store.recordFeedSuccess(feed.id, items, now(), interval);
      } catch (error: unknown) {
        options.store.recordFeedFailure(feed.id, now(), interval, error instanceof FeedReadError ? error.message : 'Feed request failed or timed out');
      }
    }
    for (const job of options.store.dueDeliveries(now(), options.maxDeliveriesPerTick ?? 50)) {
      if (!options.store.beginDelivery(job.delivery.id, now(), Math.max(60_000, timeout * 2))) continue;
      const channel = channels.get(job.target.kind);
      if (channel === undefined) { options.store.failDelivery(job.delivery.id, now(), 'Notification channel is unavailable', false); continue; }
      try {
        await channel.send(job.target, job.notification);
        options.store.acceptDelivery(job.delivery.id, now());
      } catch (error: unknown) {
        const known = error instanceof DeliveryError;
        options.store.failDelivery(job.delivery.id, now(), known ? error.message : 'Notification could not be accepted', known ? error.retryable : true, known ? error.retryAfterMs : undefined);
      }
    }
  }
  async function tick(): Promise<void> {
    if (running !== undefined) return running;
    running = work();
    try { await running; } finally { running = undefined; }
  }
  function schedule(): void {
    if (!active) return;
    timer = setTimeout(() => {
      void tick().catch((error: unknown) => options.onError?.(error)).finally(schedule);
    }, 1000);
    timer.unref();
  }
  return {
    tick,
    start(): void { if (active) return; active = true; void tick().catch((error: unknown) => options.onError?.(error)).finally(schedule); },
    async stop(): Promise<void> { active = false; if (timer !== undefined) clearTimeout(timer); if (running !== undefined) await running; },
  };
}
