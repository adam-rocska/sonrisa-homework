import { appendFileSync } from 'node:fs';
import { createPoller, createStore } from '../../src/core/src/index.js';
import type { NotificationChannel } from '../../src/core/src/index.js';

const [databasePath, receiptsPath, phase] = process.argv.slice(2);
if (!databasePath || !receiptsPath || !phase) throw new Error('Missing probe arguments');
const now = new Date(
  phase === 'seed'
    ? '2026-01-01T00:00:00Z'
    : phase === 'crash'
      ? '2026-01-01T00:01:00Z'
      : '2026-01-01T00:05:00Z',
);
const store = createStore(databasePath, { now: () => now });
if (phase === 'seed') {
  const catalog = store.replaceCatalog('probe-user', '100', [
    { url: 'https://www.google.com/alerts/feeds/100/200', query: 'probe' },
  ]);
  const feed = catalog.feeds[0];
  if (!feed) throw new Error('Missing probe feed');
  const destination = store.createDestination('probe-user', {
    kind: 'email',
    label: 'Isolated sink',
    target: 'probe@example.invalid',
  });
  store.configureFeed('probe-user', feed.id, { enabled: true, destinationIds: [destination.id] });
}
const channel: NotificationChannel = {
  kind: 'email',
  async send(_target, notification) {
    if (phase === 'crash') {
      process.send?.({ event: 'delivery-leased' });
      await new Promise<never>(() => undefined);
    }
    appendFileSync(receiptsPath, `${notification.id}\n`);
    return { status: 'accepted', detail: 'Isolated file sink' };
  },
};
const xml = `<rss><channel><item><guid>old</guid><title>Old</title><link>https://example.invalid/old</link></item>${phase === 'seed' ? '' : '<item><guid>new</guid><title>New</title><link>https://example.invalid/new</link></item>'}</channel></rss>`;
const poller = createPoller({
  store,
  channels: [channel],
  now: () => now,
  fetch: async () => new Response(xml),
  pollIntervalMs: 60_000,
});
// Keep the leased delivery alive until the parent kills this process.
const keepalive = setInterval(() => undefined, 1000);
await poller.tick();
clearInterval(keepalive);
const deliveries = store.listDeliveries('probe-user');
process.send?.({
  event: 'complete',
  deliveries: deliveries.map(({ state, attempts }) => ({ state, attempts })),
});
store.close();
process.disconnect?.();
