export type ChannelKind = 'email' | 'slack';
export type DeliveryState = 'pending' | 'accepted' | 'failed' | 'cancelled';
export type DomainErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'SOURCE_MISMATCH' | 'CONFLICT';
export class DomainError extends Error {
  public constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
export interface FeedInput { readonly url: string; readonly query: string }
export interface Feed {
  readonly id: string; readonly userId: string; readonly sourceId: string;
  readonly url: string; readonly query: string; readonly enabled: boolean;
  readonly destinationIds: readonly string[];
  readonly lastFetchedAt: Date | null; readonly nextPollAt: Date;
  readonly baselineAt: Date | null; readonly lastError: string | null;
  readonly createdAt: Date; readonly updatedAt: Date;
}
export interface Catalog {
  readonly sourceId: string | null; readonly lastSyncedAt: Date | null;
  readonly feeds: readonly Feed[];
}
export interface FeedConfiguration { readonly enabled?: boolean; readonly destinationIds?: readonly string[] }
export interface DestinationInput { readonly kind: ChannelKind; readonly label: string; readonly target: string }
export interface DestinationPatch { readonly label?: string; readonly target?: string; readonly enabled?: boolean }
export interface Destination {
  readonly id: string; readonly userId: string; readonly kind: ChannelKind;
  readonly label: string; readonly enabled: boolean;
  readonly createdAt: Date; readonly updatedAt: Date;
}
export interface Delivery {
  readonly id: string; readonly userId: string; readonly feedId: string;
  readonly destinationId: string; readonly title: string; readonly url: string;
  readonly state: DeliveryState; readonly attempts: number; readonly nextAttemptAt: Date;
  readonly acceptedAt: Date | null; readonly lastError: string | null;
  readonly createdAt: Date; readonly updatedAt: Date;
}
export interface AdminOverview {
  readonly users: number; readonly feeds: number; readonly destinations: number;
  readonly pending: number; readonly failed: number; readonly accepted: number;
  readonly recentDeliveries: readonly Delivery[];
}
export interface FeedItem {
  readonly key: string; readonly title: string; readonly url: string;
  readonly publishedAt: Date | null;
}
export interface Notification {
  readonly id: string; readonly title: string; readonly url: string;
  readonly query: string; readonly publishedAt: Date | null;
}
export interface DeliveryTarget { readonly kind: ChannelKind; readonly target: string }
export interface DeliveryReceipt { readonly status: 'accepted'; readonly detail: string }
export interface NotificationChannel {
  readonly kind: ChannelKind;
  send(target: DeliveryTarget, notification: Notification): Promise<DeliveryReceipt>;
}
export class DeliveryError extends Error {
  public constructor(message: string, public readonly retryable = true, public readonly retryAfterMs?: number) {
    super(message); this.name = 'DeliveryError';
  }
}
export function assertText(value: string, name: string, maximum = 500): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new DomainError('VALIDATION', `Invalid ${name}`);
  }
  return value.trim();
}
export function canonicalFeedUrl(value: string, sourceId: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new DomainError('VALIDATION', 'Invalid feed URL'); }
  const match = /^\/alerts\/feeds\/(\d+)\/(\d+)$/u.exec(parsed.pathname);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.google.com' || parsed.port !== '' || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '' || match === null) {
    throw new DomainError('VALIDATION', 'Expected a canonical HTTPS Google Alerts feed URL');
  }
  if (match[1] !== sourceId) throw new DomainError('SOURCE_MISMATCH', 'Feed belongs to a different Google Alerts source');
  return parsed.href;
}
export function validateTarget(kind: ChannelKind, value: string): string {
  const target = assertText(value, 'destination target', 2048);
  if (kind === 'email') {
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/u.test(target) || target.length > 254) {
      throw new DomainError('VALIDATION', 'Expected one valid email address');
    }
    return target;
  }
  if (kind !== 'slack') throw new DomainError('VALIDATION', 'Unsupported notification channel');
  let url: URL;
  try { url = new URL(target); } catch { throw new DomainError('VALIDATION', 'Invalid Slack webhook URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com' || url.port !== '' || url.username !== '' || url.password !== '' || !/^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/u.test(url.pathname) || url.search !== '' || url.hash !== '') {
    throw new DomainError('VALIDATION', 'Expected an HTTPS hooks.slack.com/services webhook');
  }
  return url.href;
}
