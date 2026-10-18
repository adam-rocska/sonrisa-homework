import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller, createStore, DeliveryError } from '../src/index.js';
import type { CatalogStore, NotificationChannel } from '../src/index.js';
let store: CatalogStore;
let now: Date;
const feed = (id: number) => ({
  url: `https://www.google.com/alerts/feeds/123/${id}`,
  query: `query ${id}`,
});
const atom = (id: string) =>
  `<feed><entry><id>${id}</id><title>${id}</title><link href="https://example.test/${id}"/></entry></feed>`;
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  now = new Date('2026-10-18T12:00:00Z');
  store = createStore(':memory:', { now: () => now });
});
afterEach(() => store.close());
function setupPending(numberOfItems = 1) {
  store.replaceCatalog('user', '123', [feed(1)]);
  const saved = store.getCatalog('user').feeds[0];
  if (saved === undefined) throw new Error('Missing fixture feed');
  const destination = store.createDestination('user', {
    kind: 'email',
    label: 'Mail',
    target: 'user@example.test',
  });
  store.configureFeed('user', saved.id, { destinationIds: [destination.id] });
  store.recordFeedSuccess(saved.id, [], now, 60_000);
  store.recordFeedSuccess(
    saved.id,
    Array.from({ length: numberOfItems }, (_, index) => ({
      key: String(index),
      title: String(index),
      url: `https://example.test/${index}`,
      publishedAt: null,
    })),
    now,
    60_000,
  );
  return saved;
}
describe('poller', () => {
  it('baselines first success then sends each new item once', async () => {
    store.replaceCatalog('user', '123', [feed(1)]);
    const saved = store.getCatalog('user').feeds[0];
    if (saved === undefined) throw new Error('Missing fixture feed');
    const destination = store.createDestination('user', {
      kind: 'email',
      label: 'Mail',
      target: 'user@example.test',
    });
    store.configureFeed('user', saved.id, { destinationIds: [destination.id] });
    let current = 'old';
    const send = vi.fn(async () => ({ status: 'accepted' as const, detail: 'local' }));
    const poller = createPoller({
      store,
      fetch: async () => new Response(atom(current)),
      channels: [{ kind: 'email', send }],
      now: () => now,
      pollIntervalMs: 1000,
    });
    await poller.tick();
    expect(send).not.toHaveBeenCalled();
    current = 'new';
    now = new Date(now.getTime() + 1000);
    await poller.tick();
    expect(send).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 1000);
    await poller.tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.listDeliveries('user')[0]?.state).toBe('accepted');
  });
  it('does not baseline a failed or malformed first fetch', async () => {
    store.replaceCatalog('user', '123', [feed(1)]);
    const poller = createPoller({
      store,
      fetch: async () => new Response('<html>Please sign in</html>'),
      channels: [],
      now: () => now,
    });
    await poller.tick();
    expect(store.getCatalog('user').feeds[0]).toMatchObject({
      baselineAt: null,
      lastError: 'Expected RSS or Atom feed',
    });
    expect(store.dueFeeds(now)).toEqual([]);
  });
  it('starts pending deliveries while feed requests are still unresolved', async () => {
    setupPending();
    now = new Date(now.getTime() + 60_000);
    const response = deferred<Response>();
    const called = deferred<void>();
    const send = vi.fn(async () => {
      called.resolve();
      return { status: 'accepted' as const, detail: 'local' };
    });
    const poller = createPoller({
      store,
      fetch: async () => response.promise,
      channels: [{ kind: 'email', send }],
      now: () => now,
    });
    const tick = poller.tick();
    await called.promise;
    expect(send).toHaveBeenCalledTimes(1);
    response.resolve(new Response('<feed><title>Empty</title></feed>'));
    await tick;
    expect(store.listDeliveries('user')[0]?.state).toBe('accepted');
  });
  it('bounds concurrent feed fetches and coalesces overlapping ticks', async () => {
    store.replaceCatalog(
      'user',
      '123',
      Array.from({ length: 5 }, (_, index) => feed(index)),
    );
    const firstWave = deferred<void>();
    const secondWave = deferred<void>();
    const requests: ReturnType<typeof deferred<Response>>[] = [];
    let active = 0;
    let maxActive = 0;
    const fetcher = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const request = deferred<Response>();
      requests.push(request);
      if (requests.length === 4) firstWave.resolve();
      if (requests.length === 5) secondWave.resolve();
      const result = await request.promise;
      active -= 1;
      return result;
    });
    const poller = createPoller({
      store,
      fetch: fetcher,
      channels: [],
      now: () => now,
      concurrency: 4,
    });
    const firstTick = poller.tick();
    const overlappingTick = poller.tick();
    await firstWave.promise;
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const request of requests)
      request.resolve(new Response('<feed><title>Empty</title></feed>'));
    await secondWave.promise;
    requests[4]?.resolve(new Response('<feed><title>Empty</title></feed>'));
    await Promise.all([firstTick, overlappingTick]);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(maxActive).toBe(4);
  });
  it('bounds concurrent sends and retains a total per-tick work cap', async () => {
    setupPending(9);
    const firstWave = deferred<void>();
    const secondWave = deferred<void>();
    const requests: ReturnType<typeof deferred<void>>[] = [];
    let active = 0;
    let maxActive = 0;
    const send = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const request = deferred<void>();
      requests.push(request);
      if (requests.length === 4) firstWave.resolve();
      if (requests.length === 5) secondWave.resolve();
      await request.promise;
      active -= 1;
      return { status: 'accepted' as const, detail: 'local' };
    });
    const poller = createPoller({
      store,
      channels: [{ kind: 'email', send }],
      now: () => now,
      concurrency: 4,
      maxDeliveriesPerTick: 5,
    });
    const tick = poller.tick();
    await firstWave.promise;
    expect(send).toHaveBeenCalledTimes(4);
    for (const request of requests) request.resolve();
    await secondWave.promise;
    requests[4]?.resolve();
    await tick;
    expect(send).toHaveBeenCalledTimes(5);
    expect(maxActive).toBe(4);
    expect(store.adminOverview()).toMatchObject({ accepted: 5, pending: 4 });
  });
  it('retries only the failed destination after its backoff', async () => {
    const saved = setupPending();
    const slack = store.createDestination('user', {
      kind: 'slack',
      label: 'Slack',
      target: 'https://hooks.slack.com/services/A/B/C',
    });
    const email = store
      .listDestinations('user')
      .find((destination) => destination.kind === 'email');
    if (email === undefined) throw new Error('Missing mail fixture');
    store.configureFeed('user', saved.id, { destinationIds: [email.id, slack.id] });
    store.recordFeedSuccess(
      saved.id,
      [{ key: 'second', title: 'Second', url: 'https://example.test/second', publishedAt: null }],
      now,
      60_000,
    );
    const emailSend = vi.fn(async () => ({ status: 'accepted' as const, detail: 'local' }));
    let fail = true;
    const slackSend = vi.fn(async () => {
      if (fail) throw new DeliveryError('Slack temporarily unavailable');
      return { status: 'accepted' as const, detail: 'local' };
    });
    const channels: NotificationChannel[] = [
      { kind: 'email', send: emailSend },
      { kind: 'slack', send: slackSend },
    ];
    const poller = createPoller({ store, channels, now: () => now });
    await poller.tick();
    expect(emailSend).toHaveBeenCalledTimes(2);
    expect(slackSend).toHaveBeenCalledTimes(1);
    await poller.tick();
    expect(slackSend).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 5000);
    fail = false;
    await poller.tick();
    expect(emailSend).toHaveBeenCalledTimes(2);
    expect(slackSend).toHaveBeenCalledTimes(2);
    expect(store.adminOverview()).toMatchObject({ accepted: 3, pending: 0 });
  });
  it('marks unavailable channels failed instead of creating a busy retry loop', async () => {
    setupPending();
    const poller = createPoller({ store, channels: [], now: () => now });
    await poller.tick();
    await poller.tick();
    expect(store.listDeliveries('user')[0]).toMatchObject({ state: 'failed', attempts: 1 });
  });
});
