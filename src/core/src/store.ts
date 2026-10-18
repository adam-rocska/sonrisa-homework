import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { assertText, canonicalFeedUrl, DomainError, validateTarget } from './domain.js';
import type { AdminOverview, Catalog, Delivery, DeliveryTarget, Destination, DestinationInput, DestinationPatch, Feed, FeedConfiguration, FeedInput, FeedItem, Notification } from './domain.js';
import { mapDelivery, mapDestination, mapFeed } from './rows.js';
import type { DeliveryRow, DestinationRow, FeedRow } from './rows.js';

const schema = `
CREATE TABLE IF NOT EXISTS sp_catalogs (
  user_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, last_synced_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sp_feeds (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_id TEXT NOT NULL,
  url TEXT NOT NULL, query_text TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, baseline_at INTEGER, last_fetched_at INTEGER,
  next_poll_at INTEGER NOT NULL, poll_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(user_id, url)
);
CREATE TABLE IF NOT EXISTS sp_destinations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('email','slack')),
  label TEXT NOT NULL, target TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sp_routes (
  feed_id TEXT NOT NULL REFERENCES sp_feeds(id),
  destination_id TEXT NOT NULL REFERENCES sp_destinations(id),
  PRIMARY KEY(feed_id, destination_id)
);
CREATE TABLE IF NOT EXISTS sp_items (
  id TEXT PRIMARY KEY, feed_id TEXT NOT NULL REFERENCES sp_feeds(id), item_key TEXT NOT NULL,
  title TEXT NOT NULL, url TEXT NOT NULL, published_at INTEGER, detected_at INTEGER NOT NULL,
  UNIQUE(feed_id, item_key)
);
CREATE TABLE IF NOT EXISTS sp_deliveries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  feed_id TEXT NOT NULL REFERENCES sp_feeds(id),
  destination_id TEXT NOT NULL REFERENCES sp_destinations(id),
  item_id TEXT NOT NULL REFERENCES sp_items(id),
  title TEXT NOT NULL, url TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','accepted','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
  accepted_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(item_id, destination_id)
);
CREATE INDEX IF NOT EXISTS sp_feed_poll ON sp_feeds(active, enabled, next_poll_at);
CREATE INDEX IF NOT EXISTS sp_delivery_poll ON sp_deliveries(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS sp_delivery_user ON sp_deliveries(user_id, created_at);
`;
interface CatalogRow { source_id: string; last_synced_at: number }
interface IdRow { id: string }
interface CountRow { count: number }
interface JobRow extends DeliveryRow { target: string; kind: 'email' | 'slack'; query_text: string; published_at: number | null }
export interface DeliveryJob { readonly delivery: Delivery; readonly target: DeliveryTarget; readonly notification: Notification }
export interface StoreOptions { readonly now?: () => Date }

export class CatalogStore {
  private readonly db: Database.Database;
  private readonly now: () => Date;
  public constructor(path: string, options: StoreOptions = {}) {
    this.db = new Database(path);
    this.now = options.now ?? (() => new Date());
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(schema);
  }
  public close(): void { this.db.close(); }
  private routes(feedId: string): string[] {
    return (this.db.prepare('SELECT destination_id AS id FROM sp_routes r JOIN sp_destinations d ON d.id=r.destination_id WHERE feed_id=? AND d.active=1 ORDER BY destination_id').all(feedId) as IdRow[]).map((row) => row.id);
  }
  private ownedFeed(userId: string, id: string): FeedRow {
    const row = this.db.prepare('SELECT * FROM sp_feeds WHERE id=? AND user_id=? AND active=1').get(id, userId) as FeedRow | undefined;
    if (row === undefined) throw new DomainError('NOT_FOUND', 'Feed not found');
    return row;
  }
  private ownedDestination(userId: string, id: string): DestinationRow {
    const row = this.db.prepare('SELECT * FROM sp_destinations WHERE id=? AND user_id=? AND active=1').get(id, userId) as DestinationRow | undefined;
    if (row === undefined) throw new DomainError('NOT_FOUND', 'Destination not found');
    return row;
  }
  public getCatalog(userId: string): Catalog {
    const row = this.db.prepare('SELECT * FROM sp_catalogs WHERE user_id=?').get(userId) as CatalogRow | undefined;
    const feeds = this.db.prepare('SELECT * FROM sp_feeds WHERE user_id=? AND active=1 ORDER BY query_text,id').all(userId) as FeedRow[];
    return { sourceId: row?.source_id ?? null, lastSyncedAt: row === undefined ? null : new Date(row.last_synced_at), feeds: feeds.map((feed) => mapFeed(feed, this.routes(feed.id))) };
  }
  public replaceCatalog(userId: string, sourceId: string, feeds: readonly FeedInput[]): Catalog {
    assertText(userId, 'user ID');
    if (!/^\d{1,100}$/u.test(sourceId)) throw new DomainError('VALIDATION', 'Invalid Google Alerts source ID');
    if (!Array.isArray(feeds) || feeds.length > 1000) throw new DomainError('VALIDATION', 'At most 1000 feeds are allowed');
    const inputs = feeds.map((feed) => ({ url: canonicalFeedUrl(feed.url, sourceId), query: assertText(feed.query, 'search query') }));
    if (new Set(inputs.map((feed) => feed.url)).size !== inputs.length) throw new DomainError('VALIDATION', 'Duplicate feed URL');
    const timestamp = this.now().getTime();
    this.db.transaction(() => {
      const current = this.db.prepare('SELECT * FROM sp_catalogs WHERE user_id=?').get(userId) as CatalogRow | undefined;
      if (current !== undefined && current.source_id !== sourceId) throw new DomainError('SOURCE_MISMATCH', 'A different Google Alerts account is already connected');
      this.db.prepare('INSERT INTO sp_catalogs(user_id,source_id,last_synced_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_synced_at=excluded.last_synced_at').run(userId, sourceId, timestamp);
      this.db.prepare('UPDATE sp_feeds SET active=0,updated_at=? WHERE user_id=?').run(timestamp, userId);
      const insert = this.db.prepare(`INSERT INTO sp_feeds(id,user_id,source_id,url,query_text,next_poll_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,url) DO UPDATE SET query_text=excluded.query_text,active=1,updated_at=excluded.updated_at`);
      for (const feed of inputs) insert.run(randomUUID(), userId, sourceId, feed.url, feed.query, timestamp, timestamp, timestamp);
      this.db.prepare(`UPDATE sp_deliveries SET state='cancelled',updated_at=?,last_error='Feed removed from source catalogue'
        WHERE user_id=? AND state='pending' AND feed_id IN (SELECT id FROM sp_feeds WHERE user_id=? AND active=0)`).run(timestamp, userId, userId);
    })();
    return this.getCatalog(userId);
  }
  public configureFeed(userId: string, feedId: string, patch: FeedConfiguration): Feed {
    this.db.transaction(() => {
      const feed = this.ownedFeed(userId, feedId);
      const timestamp = this.now().getTime();
      if (patch.destinationIds !== undefined) {
        if (patch.destinationIds.length > 100 || new Set(patch.destinationIds).size !== patch.destinationIds.length) throw new DomainError('VALIDATION', 'Invalid destination selection');
        for (const id of patch.destinationIds) this.ownedDestination(userId, id);
        this.db.prepare('DELETE FROM sp_routes WHERE feed_id=?').run(feedId);
        for (const id of patch.destinationIds) this.db.prepare('INSERT INTO sp_routes(feed_id,destination_id) VALUES(?,?)').run(feedId, id);
        this.db.prepare(`UPDATE sp_deliveries SET state='cancelled',updated_at=?,last_error='Destination removed from feed'
          WHERE feed_id=? AND state='pending' AND destination_id NOT IN (SELECT destination_id FROM sp_routes WHERE feed_id=?)`).run(timestamp, feedId, feedId);
      }
      this.db.prepare('UPDATE sp_feeds SET enabled=?,updated_at=? WHERE id=?').run(patch.enabled === undefined ? feed.enabled : Number(patch.enabled), timestamp, feedId);
    })();
    return mapFeed(this.ownedFeed(userId, feedId), this.routes(feedId));
  }
  public listDestinations(userId: string): Destination[] {
    return (this.db.prepare('SELECT * FROM sp_destinations WHERE user_id=? AND active=1 ORDER BY label,id').all(userId) as DestinationRow[]).map(mapDestination);
  }
  public createDestination(userId: string, input: DestinationInput): Destination {
    assertText(userId, 'user ID');
    const label = assertText(input.label, 'destination label', 100);
    const target = validateTarget(input.kind, input.target);
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM sp_destinations WHERE user_id=? AND active=1').get(userId) as CountRow;
    if (count.count >= 100) throw new DomainError('VALIDATION', 'At most 100 destinations are allowed');
    const id = randomUUID(); const timestamp = this.now().getTime();
    this.db.prepare('INSERT INTO sp_destinations(id,user_id,kind,label,target,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, userId, input.kind, label, target, timestamp, timestamp);
    return mapDestination(this.ownedDestination(userId, id));
  }
  public updateDestination(userId: string, id: string, patch: DestinationPatch): Destination {
    const row = this.ownedDestination(userId, id);
    const label = patch.label === undefined ? row.label : assertText(patch.label, 'destination label', 100);
    const target = patch.target === undefined ? row.target : validateTarget(row.kind, patch.target);
    this.db.prepare('UPDATE sp_destinations SET label=?,target=?,enabled=?,updated_at=? WHERE id=?').run(label, target, patch.enabled === undefined ? row.enabled : Number(patch.enabled), this.now().getTime(), id);
    return mapDestination(this.ownedDestination(userId, id));
  }
  public removeDestination(userId: string, id: string): void {
    this.db.transaction(() => {
      this.ownedDestination(userId, id); const timestamp = this.now().getTime();
      this.db.prepare('UPDATE sp_destinations SET active=0,updated_at=? WHERE id=?').run(timestamp, id);
      this.db.prepare('DELETE FROM sp_routes WHERE destination_id=?').run(id);
      this.db.prepare("UPDATE sp_deliveries SET state='cancelled',last_error='Destination removed',updated_at=? WHERE destination_id=? AND state='pending'").run(timestamp, id);
    })();
  }
  public listDeliveries(userId: string, limit = 50): Delivery[] {
    const bounded = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.trunc(limit) : 50));
    return (this.db.prepare('SELECT * FROM sp_deliveries WHERE user_id=? ORDER BY created_at DESC,id LIMIT ?').all(userId, bounded) as DeliveryRow[]).map(mapDelivery);
  }
  public adminOverview(): AdminOverview {
    const count = (query: string): number => (this.db.prepare(query).get() as CountRow).count;
    return { users: count('SELECT COUNT(*) AS count FROM sp_catalogs'), feeds: count('SELECT COUNT(*) AS count FROM sp_feeds WHERE active=1'),
      destinations: count('SELECT COUNT(*) AS count FROM sp_destinations WHERE active=1'),
      pending: count("SELECT COUNT(*) AS count FROM sp_deliveries WHERE state='pending'"),
      failed: count("SELECT COUNT(*) AS count FROM sp_deliveries WHERE state='failed'"),
      accepted: count("SELECT COUNT(*) AS count FROM sp_deliveries WHERE state='accepted'"),
      recentDeliveries: (this.db.prepare('SELECT * FROM sp_deliveries ORDER BY created_at DESC,id LIMIT 50').all() as DeliveryRow[]).map(mapDelivery) };
  }
  public retryDelivery(id: string): Delivery {
    const row = this.db.prepare('SELECT * FROM sp_deliveries WHERE id=?').get(id) as DeliveryRow | undefined;
    if (row === undefined) throw new DomainError('NOT_FOUND', 'Delivery not found');
    if (row.state !== 'failed' && row.state !== 'pending') throw new DomainError('CONFLICT', 'Only pending or failed deliveries can be retried');
    const feed = this.ownedFeed(row.user_id, row.feed_id); const target = this.ownedDestination(row.user_id, row.destination_id);
    if (feed.enabled !== 1 || target.enabled !== 1 || !this.routes(feed.id).includes(target.id)) throw new DomainError('CONFLICT', 'Enable the feed and its destination before retrying');
    const timestamp = this.now().getTime();
    this.db.prepare("UPDATE sp_deliveries SET state='pending',attempts=0,next_attempt_at=?,last_error=NULL,updated_at=? WHERE id=?").run(timestamp, timestamp, id);
    return mapDelivery(this.db.prepare('SELECT * FROM sp_deliveries WHERE id=?').get(id) as DeliveryRow);
  }
  public dueFeeds(now: Date, limit = 20): Feed[] {
    return (this.db.prepare('SELECT * FROM sp_feeds WHERE active=1 AND enabled=1 AND next_poll_at<=? ORDER BY next_poll_at,id LIMIT ?').all(now.getTime(), limit) as FeedRow[]).map((row) => mapFeed(row, this.routes(row.id)));
  }
  public recordFeedSuccess(feedId: string, items: readonly FeedItem[], now: Date, intervalMs: number): void {
    this.db.transaction(() => {
      const feed = this.db.prepare('SELECT * FROM sp_feeds WHERE id=? AND active=1 AND enabled=1').get(feedId) as FeedRow | undefined;
      if (feed === undefined) return;
      const destinations = this.db.prepare('SELECT d.* FROM sp_destinations d JOIN sp_routes r ON r.destination_id=d.id WHERE r.feed_id=? AND d.active=1 AND d.enabled=1').all(feedId) as DestinationRow[];
      for (const item of items) {
        const id = randomUUID();
        const inserted = this.db.prepare('INSERT OR IGNORE INTO sp_items(id,feed_id,item_key,title,url,published_at,detected_at) VALUES(?,?,?,?,?,?,?)').run(id, feedId, item.key, item.title, item.url, item.publishedAt?.getTime() ?? null, now.getTime());
        if (inserted.changes === 0 || feed.baseline_at === null) continue;
        for (const destination of destinations) {
          this.db.prepare("INSERT OR IGNORE INTO sp_deliveries(id,user_id,feed_id,destination_id,item_id,title,url,state,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',?,?,?)").run(randomUUID(), feed.user_id, feedId, destination.id, id, item.title, item.url, now.getTime(), now.getTime(), now.getTime());
        }
      }
      this.db.prepare('UPDATE sp_feeds SET baseline_at=COALESCE(baseline_at,?),last_fetched_at=?,next_poll_at=?,poll_failures=0,last_error=NULL,updated_at=? WHERE id=?').run(now.getTime(), now.getTime(), now.getTime() + intervalMs, now.getTime(), feedId);
    })();
  }
  public recordFeedFailure(feedId: string, now: Date, intervalMs: number, message: string): void {
    const feed = this.db.prepare('SELECT * FROM sp_feeds WHERE id=?').get(feedId) as FeedRow | undefined;
    if (feed === undefined) return;
    const delay = Math.min(30 * 60_000, intervalMs * 2 ** Math.min(feed.poll_failures, 10));
    this.db.prepare('UPDATE sp_feeds SET last_fetched_at=?,next_poll_at=?,poll_failures=poll_failures+1,last_error=?,updated_at=? WHERE id=?').run(now.getTime(), now.getTime() + delay, message.slice(0, 300), now.getTime(), feedId);
  }
  public dueDeliveries(now: Date, limit = 50): DeliveryJob[] {
    const rows = this.db.prepare(`SELECT x.*,d.target,d.kind,f.query_text,i.published_at FROM sp_deliveries x
      JOIN sp_destinations d ON d.id=x.destination_id JOIN sp_feeds f ON f.id=x.feed_id JOIN sp_items i ON i.id=x.item_id
      WHERE x.state='pending' AND x.next_attempt_at<=? AND d.active=1 AND d.enabled=1 AND f.active=1 AND f.enabled=1
      ORDER BY x.next_attempt_at,x.id LIMIT ?`).all(now.getTime(), limit) as JobRow[];
    return rows.map((row) => ({ delivery: mapDelivery(row), target: { kind: row.kind, target: row.target },
      notification: { id: row.id, title: row.title, url: row.url, query: row.query_text, publishedAt: row.published_at === null ? null : new Date(row.published_at) } }));
  }
  public beginDelivery(id: string, now: Date, leaseMs: number): boolean {
    return this.db.prepare("UPDATE sp_deliveries SET attempts=attempts+1,next_attempt_at=?,updated_at=? WHERE id=? AND state='pending' AND next_attempt_at<=?").run(now.getTime() + leaseMs, now.getTime(), id, now.getTime()).changes === 1;
  }
  public acceptDelivery(id: string, now: Date): void {
    this.db.prepare("UPDATE sp_deliveries SET state='accepted',accepted_at=?,last_error=NULL,updated_at=? WHERE id=? AND state='pending'").run(now.getTime(), now.getTime(), id);
  }
  public failDelivery(id: string, now: Date, message: string, retryable: boolean, retryAfterMs?: number): void {
    const row = this.db.prepare('SELECT * FROM sp_deliveries WHERE id=?').get(id) as DeliveryRow | undefined;
    if (row === undefined || row.state !== 'pending') return;
    const delay = Math.min(60 * 60_000, Math.max(1000, retryAfterMs ?? 5000 * 2 ** Math.max(0, Math.min(row.attempts - 1, 12))));
    this.db.prepare('UPDATE sp_deliveries SET state=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?').run(retryable && row.attempts < 8 ? 'pending' : 'failed', now.getTime() + delay, message.slice(0, 300), now.getTime(), id);
  }
}
export function createStore(path: string, options: StoreOptions = {}): CatalogStore { return new CatalogStore(path, options); }
