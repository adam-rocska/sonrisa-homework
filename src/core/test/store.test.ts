import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore, DomainError } from '../src/index.js';
import type { CatalogStore, FeedItem } from '../src/index.js';
import { mapDelivery, mapDestination, mapFeed } from '../src/rows.js';

const source = '123';
const feed = (id: string, query = id) => ({
  url: `https://www.google.com/alerts/feeds/${source}/${id}`,
  query,
});
const item = (key: string): FeedItem => ({
  key,
  title: key,
  url: `https://example.test/${key}`,
  publishedAt: null,
});
let now: Date;
let store: CatalogStore;
beforeEach(() => {
  now = new Date('2026-10-18T12:00:00Z');
  store = createStore(':memory:', { now: () => now });
});
afterEach(() => store.close());
function firstFeed() {
  const result = store.getCatalog('alice').feeds[0];
  if (result === undefined) throw new Error('Expected fixture feed');
  return result;
}
function prepareDelivery() {
  store.replaceCatalog('alice', source, [feed('1')]);
  const destination = store.createDestination('alice', {
    kind: 'email',
    label: 'Inbox',
    target: 'alice@example.test',
  });
  store.configureFeed('alice', firstFeed().id, { destinationIds: [destination.id] });
  store.recordFeedSuccess(firstFeed().id, [item('baseline')], now, 1000);
  now = new Date(now.getTime() + 1000);
  store.recordFeedSuccess(firstFeed().id, [item('baseline'), item('new')], now, 1000);
  const delivery = store.listDeliveries('alice')[0];
  if (delivery === undefined) throw new Error('Expected fixture delivery');
  return { destination, delivery, feedId: firstFeed().id };
}
describe('whole catalogue replacement', () => {
  it('preserves stable identity, configuration and routes on a retained URL', () => {
    store.replaceCatalog('alice', source, [feed('1'), feed('2')]);
    const original = firstFeed();
    const destination = store.createDestination('alice', {
      kind: 'email',
      label: 'Inbox',
      target: 'alice@example.test',
    });
    store.configureFeed('alice', original.id, { enabled: false, destinationIds: [destination.id] });
    now = new Date(now.getTime() + 50);
    const result = store.replaceCatalog('alice', source, [feed('1', 'Renamed')]);
    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0]).toMatchObject({
      id: original.id,
      query: 'Renamed',
      enabled: false,
      destinationIds: [destination.id],
    });
    expect(result.lastSyncedAt).toEqual(now);
  });
  it('scopes replacement to the authenticated owner and rejects a connected-account change', () => {
    store.replaceCatalog('alice', source, [feed('1')]);
    store.replaceCatalog('bob', source, [feed('2')]);
    expect(() => store.replaceCatalog('alice', '999', [])).toThrowError(DomainError);
    store.replaceCatalog('alice', source, []);
    expect(store.getCatalog('bob').feeds).toHaveLength(1);
    expect(store.getCatalog('alice')).toMatchObject({ sourceId: source, feeds: [] });
  });
  it.each([
    'http://www.google.com/alerts/feeds/123/1',
    'https://evil.test/alerts/feeds/123/1',
    'https://www.google.com/alerts/feeds/999/1',
    'https://user:password@www.google.com/alerts/feeds/123/1',
    'https://www.google.com/alerts/feeds/123/1?x=y',
    'https://www.google.com/alerts/feeds/123/1#secret',
    'https://www.google.com:444/alerts/feeds/123/1',
  ])('rejects unsafe feed %s without changing the catalogue', (url) => {
    store.replaceCatalog('alice', source, [feed('1')]);
    expect(() => store.replaceCatalog('alice', source, [{ url, query: 'unsafe' }])).toThrow();
    expect(store.getCatalog('alice').feeds).toHaveLength(1);
  });
  it('rejects duplicates, oversized snapshots, and malformed queries before writing', () => {
    expect(() => store.replaceCatalog('alice', source, [feed('1'), feed('1')])).toThrow();
    expect(() =>
      store.replaceCatalog(
        'alice',
        source,
        Array.from({ length: 1001 }, (_, index) => feed(String(index))),
      ),
    ).toThrow();
    expect(() => store.replaceCatalog('alice', source, [feed('1', '\r\n')])).toThrow();
    expect(store.getCatalog('alice').sourceId).toBeNull();
  });
  it('cancels pending delivery when a feed is omitted', () => {
    prepareDelivery();
    store.replaceCatalog('alice', source, []);
    expect(store.listDeliveries('alice')[0]?.state).toBe('cancelled');
    expect(store.dueDeliveries(now)).toEqual([]);
  });
});
describe('destinations and ownership', () => {
  it('returns safe destination domain data without webhook secrets', () => {
    const destination = store.createDestination('alice', {
      kind: 'slack',
      label: 'Team',
      target: 'https://hooks.slack.com/services/T1/B2/SECRET',
    });
    expect(JSON.stringify(destination)).not.toContain('SECRET');
    expect(JSON.stringify(store.listDestinations('alice'))).not.toContain('target');
    expect(destination.createdAt).toBeInstanceOf(Date);
  });
  it('prevents cross-user feed changes, destination changes and routing', () => {
    store.replaceCatalog('alice', source, [feed('1')]);
    const destination = store.createDestination('bob', {
      kind: 'email',
      label: 'Private',
      target: 'bob@example.test',
    });
    expect(() => store.configureFeed('bob', firstFeed().id, { enabled: false })).toThrow();
    expect(() =>
      store.configureFeed('alice', firstFeed().id, { destinationIds: [destination.id] }),
    ).toThrow();
    expect(() => store.updateDestination('alice', destination.id, { enabled: false })).toThrow();
    expect(() => store.removeDestination('alice', destination.id)).toThrow();
    expect(firstFeed().destinationIds).toEqual([]);
  });
  it.each(['victim@example.test\r\nBcc: bad@example.test', 'a@b', 'a b@example.test'])(
    'rejects unsafe email %s',
    (target) => {
      expect(() =>
        store.createDestination('alice', { kind: 'email', label: 'Mail', target }),
      ).toThrow();
    },
  );
  it.each([
    'https://hooks.slack.com.evil.test/services/A/B/C',
    'http://hooks.slack.com/services/A/B/C',
    'https://hooks.slack.com/services/A/B/C?secret=1',
  ])('rejects unsafe webhook %s', (target) => {
    expect(() =>
      store.createDestination('alice', { kind: 'slack', label: 'Slack', target }),
    ).toThrow();
  });
  it('cancels outstanding notifications when routing or destination is removed', () => {
    const { destination, feedId } = prepareDelivery();
    store.configureFeed('alice', feedId, { destinationIds: [] });
    expect(store.listDeliveries('alice')[0]?.state).toBe('cancelled');
    store.removeDestination('alice', destination.id);
    expect(store.listDestinations('alice')).toEqual([]);
  });
});
describe('durable feed and delivery state', () => {
  it('creates no historical deliveries on baseline and dedupes later polls', () => {
    store.replaceCatalog('alice', source, [feed('1')]);
    const id = firstFeed().id;
    const destination = store.createDestination('alice', {
      kind: 'email',
      label: 'Mail',
      target: 'alice@example.test',
    });
    store.configureFeed('alice', id, { destinationIds: [destination.id] });
    store.recordFeedSuccess(id, [item('old')], now, 1000);
    expect(store.listDeliveries('alice')).toEqual([]);
    store.recordFeedSuccess(id, [item('old'), item('fresh'), item('fresh')], now, 1000);
    store.recordFeedSuccess(id, [item('fresh')], now, 1000);
    expect(store.listDeliveries('alice')).toHaveLength(1);
    expect(firstFeed().baselineAt).toEqual(now);
  });
  it('retries failed targets without repeating accepted targets', () => {
    const { delivery } = prepareDelivery();
    expect(store.beginDelivery(delivery.id, now, 60_000)).toBe(true);
    expect(store.beginDelivery(delivery.id, now, 60_000)).toBe(false);
    store.failDelivery(delivery.id, now, 'Temporary failure', true);
    expect(store.dueDeliveries(now)).toEqual([]);
    now = new Date(now.getTime() + 5000);
    expect(store.dueDeliveries(now)).toHaveLength(1);
    store.acceptDelivery(delivery.id, now);
    expect(store.dueDeliveries(new Date(now.getTime() + 100_000))).toEqual([]);
    expect(() => store.retryDelivery(delivery.id)).toThrow();
  });
  it('stops automatic retry after eight attempts, permits explicit admin retry', () => {
    const { delivery } = prepareDelivery();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(store.beginDelivery(delivery.id, now, 60_000)).toBe(true);
      store.failDelivery(delivery.id, now, 'Temporary failure', true);
      now = new Date(now.getTime() + 3_600_000);
    }
    expect(store.listDeliveries('alice')[0]).toMatchObject({ state: 'failed', attempts: 8 });
    expect(store.retryDelivery(delivery.id)).toMatchObject({
      state: 'pending',
      attempts: 0,
      lastError: null,
    });
  });
  it('does not poll paused feeds and retains bounded exponential feed backoff', () => {
    store.replaceCatalog('alice', source, [feed('1')]);
    const id = firstFeed().id;
    store.recordFeedFailure(id, now, 60_000, 'HTTP 500');
    expect(store.dueFeeds(now)).toEqual([]);
    now = new Date(now.getTime() + 60_000);
    expect(store.dueFeeds(now)).toHaveLength(1);
    store.recordFeedFailure(id, now, 60_000, 'HTTP 500');
    expect(firstFeed().nextPollAt.getTime() - now.getTime()).toBe(120_000);
    store.configureFeed('alice', id, { enabled: false });
    expect(store.dueFeeds(new Date(now.getTime() + 9_000_000))).toEqual([]);
  });
  it('aggregates admin state and retains destination-level acceptance semantics', () => {
    const { delivery } = prepareDelivery();
    expect(store.adminOverview()).toMatchObject({
      users: 1,
      feeds: 1,
      destinations: 1,
      pending: 1,
      accepted: 0,
    });
    store.acceptDelivery(delivery.id, now);
    expect(store.adminOverview()).toMatchObject({ pending: 0, accepted: 1 });
  });
});
describe('explicit persistence-to-domain mappings', () => {
  it('maps integers to Dates and booleans without exposing storage fields', () => {
    const result = mapFeed(
      {
        id: 'f',
        user_id: 'u',
        source_id: '1',
        url: 'url',
        query_text: 'query',
        enabled: 1,
        active: 1,
        baseline_at: null,
        last_fetched_at: 20,
        next_poll_at: 30,
        poll_failures: 2,
        last_error: null,
        created_at: 0,
        updated_at: 40,
      },
      ['d'],
    );
    expect(result).toMatchObject({
      enabled: true,
      baselineAt: null,
      lastFetchedAt: new Date(20),
      destinationIds: ['d'],
    });
    expect(result).not.toHaveProperty('poll_failures');
    const destination = mapDestination({
      id: 'd',
      user_id: 'u',
      kind: 'email',
      label: 'label',
      target: 'secret',
      enabled: 0,
      active: 1,
      created_at: 0,
      updated_at: 20,
    });
    expect(destination).not.toHaveProperty('target');
    const delivery = mapDelivery({
      id: 'x',
      user_id: 'u',
      feed_id: 'f',
      destination_id: 'd',
      item_id: 'i',
      title: 't',
      url: 'u',
      state: 'accepted',
      attempts: 1,
      next_attempt_at: 30,
      accepted_at: 20,
      last_error: null,
      created_at: 0,
      updated_at: 20,
    });
    expect(delivery.acceptedAt).toEqual(new Date(20));
    expect(delivery).not.toHaveProperty('item_id');
  });
});
