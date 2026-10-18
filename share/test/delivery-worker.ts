import assert from 'node:assert/strict';
import {
  createPoller,
  createSendmailChannel,
  createSlackChannel,
  createStore,
  type FetchFunction,
} from '../../src/core/src/index.js';

const [databasePath, fixtureOrigin, sendmailPath, phase, mailConfiguration] = process.argv.slice(2);
assert(databasePath && fixtureOrigin && sendmailPath && phase, 'Missing delivery probe arguments');
assert(mailConfiguration, 'Missing isolated mail configuration');
const { sender, recipient } = JSON.parse(mailConfiguration) as {
  sender: string;
  recipient: string;
};
const origin = new URL(fixtureOrigin);
assert.equal(origin.hostname, '127.0.0.1');
assert.equal(origin.protocol, 'http:');
const elapsed: Readonly<Record<string, number>> = {
  baseline: 0,
  publish: 1000,
  waiting: 1999,
  retry: 2000,
  repeat: 3000,
};
const milliseconds = elapsed[phase];
assert(milliseconds !== undefined, 'Unknown delivery probe phase');
const now = new Date(Date.parse('2026-01-01T00:00:00Z') + milliseconds);
const feedUrl = 'https://www.google.com/alerts/feeds/100/200';
const webhookUrl = 'https://hooks.slack.com/services/PROBE/ONLY/NOT_A_SECRET';
const userId = 'isolated-delivery-probe';
const store = createStore(databasePath, { now: () => now });

// The production adapters still validate canonical provider URLs. Only these
// two test URLs reach the loopback fixtures; every other URL is rejected.
const fixtureFetch: FetchFunction = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  assert(init?.signal, 'The adapter must provide its request deadline');
  assert.equal(init.redirect, 'error');
  if (url === feedUrl) return fetch(new URL('/feed.xml', origin), init);
  if (url === webhookUrl) return fetch(new URL('/services/PROBE/ONLY/NOT_A_SECRET', origin), init);
  throw new Error('Unexpected network destination in isolated probe');
};

try {
  if (phase === 'baseline') {
    const feed = store.replaceCatalog(userId, '100', [
      { url: feedUrl, query: 'árvíz "teszt" & hírek' },
    ]).feeds[0];
    assert(feed);
    const email = store.createDestination(userId, {
      kind: 'email',
      label: 'Subprocess MIME sink',
      target: recipient,
    });
    const slack = store.createDestination(userId, {
      kind: 'slack',
      label: 'Loopback webhook sink',
      target: webhookUrl,
    });
    store.configureFeed(userId, feed.id, { destinationIds: [email.id, slack.id] });
  }
  const poller = createPoller({
    store,
    fetch: fixtureFetch,
    now: () => now,
    pollIntervalMs: 1000,
    channels: [
      createSlackChannel({ fetch: fixtureFetch }),
      createSendmailChannel({ from: sender, executable: sendmailPath }),
    ],
  });
  await poller.tick();
  await poller.stop();
  const destinations = store.listDestinations(userId);
  const feed = store.getCatalog(userId).feeds[0];
  assert(feed);
  process.send?.({
    event: 'complete',
    phase,
    baselineAt: feed.baselineAt?.toISOString() ?? null,
    feedError: feed.lastError,
    deliveries: store.listDeliveries(userId).map((delivery) => ({
      kind: destinations.find((destination) => destination.id === delivery.destinationId)?.kind,
      state: delivery.state,
      attempts: delivery.attempts,
      lastError: delivery.lastError,
      nextAttemptAt: delivery.nextAttemptAt.toISOString(),
      title: delivery.title,
      url: delivery.url,
    })),
  });
} finally {
  store.close();
  process.disconnect?.();
}
