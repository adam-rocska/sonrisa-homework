import type { Delivery, DeliveryState, Destination, ChannelKind, Feed } from './domain.js';
export interface FeedRow {
  id: string; user_id: string; source_id: string; url: string; query_text: string;
  enabled: number; active: number; baseline_at: number | null; last_fetched_at: number | null;
  next_poll_at: number; poll_failures: number; last_error: string | null; created_at: number; updated_at: number;
}
export interface DestinationRow {
  id: string; user_id: string; kind: ChannelKind; label: string; target: string;
  enabled: number; active: number; created_at: number; updated_at: number;
}
export interface DeliveryRow {
  id: string; user_id: string; feed_id: string; destination_id: string; item_id: string;
  title: string; url: string; state: DeliveryState; attempts: number; next_attempt_at: number;
  accepted_at: number | null; last_error: string | null; created_at: number; updated_at: number;
}
export function nullableDate(value: number | null): Date | null { return value === null ? null : new Date(value); }
export function mapFeed(row: FeedRow, destinationIds: readonly string[]): Feed {
  return { id: row.id, userId: row.user_id, sourceId: row.source_id, url: row.url,
    query: row.query_text, enabled: row.enabled === 1, destinationIds,
    baselineAt: nullableDate(row.baseline_at), lastFetchedAt: nullableDate(row.last_fetched_at),
    nextPollAt: new Date(row.next_poll_at), lastError: row.last_error,
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}
export function mapDestination(row: DestinationRow): Destination {
  return { id: row.id, userId: row.user_id, kind: row.kind, label: row.label,
    enabled: row.enabled === 1, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}
export function mapDelivery(row: DeliveryRow): Delivery {
  return { id: row.id, userId: row.user_id, feedId: row.feed_id, destinationId: row.destination_id,
    title: row.title, url: row.url, state: row.state, attempts: row.attempts,
    nextAttemptAt: new Date(row.next_attempt_at), acceptedAt: nullableDate(row.accepted_at),
    lastError: row.last_error, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}
