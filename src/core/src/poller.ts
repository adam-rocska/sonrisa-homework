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
  readonly concurrency?: number;
  readonly onError?: (error: unknown) => void;
}
export interface Poller {
  tick(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
}
export function createPoller(options: PollerOptions): Poller {
  const now = options.now ?? (() => new Date());
  const fetcher = options.fetch ?? globalThis.fetch;
  const interval = options.pollIntervalMs ?? 60_000;
  const timeout = options.requestTimeoutMs ?? 10_000;
  if (
    !Number.isFinite(interval) ||
    interval < 1000 ||
    !Number.isFinite(timeout) ||
    timeout < 1 ||
    timeout > 120_000
  )
    throw new Error('Invalid polling interval or timeout');
  const concurrency = options.concurrency ?? 4;
  const feedLimit = options.maxFeedsPerTick ?? 20;
  const deliveryLimit = options.maxDeliveriesPerTick ?? 50;
  if (
    ![concurrency, feedLimit, deliveryLimit].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 1000,
    ) ||
    concurrency > 16
  )
    throw new Error('Invalid worker limits');
  const channels = new Map(options.channels.map((channel) => [channel.kind, channel]));
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  async function eachLimited<T>(
    items: readonly T[],
    handle: (item: T) => Promise<void>,
  ): Promise<void> {
    let index = 0;
    async function worker(): Promise<void> {
      for (;;) {
        const item = items[index];
        index += 1;
        if (item === undefined) return;
        await handle(item);
      }
    }
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  async function pollFeeds(): Promise<void> {
    await eachLimited(options.store.dueFeeds(now(), feedLimit), async (feed) => {
      try {
        const items = await fetchFeed(feed.url, fetcher, {
          timeoutMs: timeout,
          maxBytes: options.maxFeedBytes ?? 2 * 1024 * 1024,
        });
        options.store.recordFeedSuccess(feed.id, items, now(), interval);
      } catch (error: unknown) {
        options.store.recordFeedFailure(
          feed.id,
          now(),
          interval,
          error instanceof FeedReadError ? error.message : 'Feed request failed or timed out',
        );
      }
    });
  }
  async function deliverDue(limit: number): Promise<number> {
    const jobs = options.store.dueDeliveries(now(), limit);
    await eachLimited(jobs, async (job) => {
      if (!options.store.beginDelivery(job.delivery.id, now(), Math.max(60_000, timeout * 2)))
        return;
      const channel = channels.get(job.target.kind);
      if (channel === undefined) {
        options.store.failDelivery(
          job.delivery.id,
          now(),
          'Notification channel is unavailable',
          false,
        );
        return;
      }
      try {
        await channel.send(job.target, job.notification);
        options.store.acceptDelivery(job.delivery.id, now());
      } catch (error: unknown) {
        const known = error instanceof DeliveryError;
        options.store.failDelivery(
          job.delivery.id,
          now(),
          known ? error.message : 'Notification could not be accepted',
          known ? error.retryable : true,
          known ? error.retryAfterMs : undefined,
        );
      }
    });
    return jobs.length;
  }
  async function work(): Promise<void> {
    // Delivery starts immediately even when remote feed requests are slow.
    const [polling, sending] = await Promise.allSettled([pollFeeds(), deliverDue(deliveryLimit)]);
    if (polling.status === 'rejected') throw polling.reason;
    if (sending.status === 'rejected') throw sending.reason;
    // Newly discovered items can be accepted in this tick, within its total cap.
    if (sending.value < deliveryLimit) await deliverDue(deliveryLimit - sending.value);
  }
  async function tick(): Promise<void> {
    if (running !== undefined) return running;
    running = work();
    try {
      await running;
    } finally {
      running = undefined;
    }
  }
  function schedule(): void {
    if (!active) return;
    timer = setTimeout(() => {
      void tick()
        .catch((error: unknown) => options.onError?.(error))
        .finally(schedule);
    }, 1000);
    timer.unref();
  }
  return {
    tick,
    start(): void {
      if (active) return;
      active = true;
      void tick()
        .catch((error: unknown) => options.onError?.(error))
        .finally(schedule);
    },
    async stop(): Promise<void> {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      if (running !== undefined) await running;
    },
  };
}
