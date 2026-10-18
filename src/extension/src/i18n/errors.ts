import type { Translator } from './index';
import { en } from './system.en';
import { hu } from './system.hu';

export type SystemMessageKey = keyof typeof en;
export interface SystemMessage {
  readonly messageKey: SystemMessageKey;
  readonly messageParams?: Record<string, string | number>;
}
interface SavedMessage {
  readonly message: string;
  readonly messageKey?: string | undefined;
  readonly messageParams?: Record<string, string | number> | undefined;
  readonly feedCount?: number | undefined;
  readonly emailOnlyCount?: number | undefined;
  readonly state?: string | undefined;
}
export class LocalizedError extends Error {
  constructor(readonly messageKey: SystemMessageKey) {
    super(messageKey);
    this.name = 'LocalizedError';
  }
}
function isSystemKey(value: unknown): value is SystemMessageKey {
  return typeof value === 'string' && Object.hasOwn(en, value);
}

// Compatibility boundary for errors originating in DOM, auth and older persisted clients.
// No raw server/error text is surfaced as a fallback (it may contain private addresses).
const aliases: Record<string, SystemMessageKey> = {
  'Your account or server changed. Sync again from the current account.': 'error.identityChanged',
  'Your account or server changed while syncing. Refresh the current account.':
    'error.identityChanged',
  'Your account or server changed. Sync again.': 'error.identityChanged',
  'This Google Alerts account differs from the connected account.': 'error.sourceMismatch',
  'A different Google Alerts account is already connected': 'error.sourceMismatch',
  'Feed belongs to a different Google Alerts source': 'error.sourceMismatch',
  'Sign in to Signalpost first.': 'error.signalpostSignIn',
  'Sign in to Signalpost with Google first.': 'error.signalpostSignIn',
  'An alert has ambiguous RSS links.': 'error.ambiguousFeed',
  'Google returned an unfamiliar feed address.': 'error.invalidFeed',
  'Alerts from multiple Google accounts were found.': 'error.multipleSources',
  'Google sign-in did not return a result.': 'error.authIncomplete',
  'Google sign-in was not completed.': 'error.authIncomplete',
  access_denied: 'error.authIncomplete',
  invalid_flow: 'error.authCallback',
  missing_session: 'error.authIncomplete',
  auth_unavailable: 'error.authConfiguration',
  'The user did not approve access.': 'error.authIncomplete',
  'Authorization page could not be loaded.': 'error.network',
  'Destination not found.': 'error.notFound',
  'Destination not found': 'error.notFound',
  'Feed not found': 'error.notFound',
  'Delivery not found': 'error.notFound',
  'Invalid Google Alerts source ID': 'error.invalidFeed',
  'Invalid feed URL': 'error.invalidFeed',
  'Expected a canonical HTTPS Google Alerts feed URL': 'error.invalidFeed',
  'Duplicate feed URL': 'error.duplicateFeed',
  'Invalid destination selection': 'error.invalidInput',
  'Unsupported notification channel': 'error.invalidInput',
  'At most 1000 feeds are allowed': 'error.feedLimit',
  'At most 100 destinations are allowed': 'error.destinationLimit',
  'Only pending or failed deliveries can be retried': 'error.retryState',
  'Enable the feed and its destination before retrying': 'error.retryDisabled',
  'Expected one valid email address': 'error.emailAddress',
  'Invalid Slack webhook URL': 'error.slackWebhook',
  'Expected an HTTPS hooks.slack.com/services webhook': 'error.slackWebhook',
  'The server could not complete this operation.': 'error.server',
  'Feed request failed or timed out': 'error.feedNetwork',
  'Feed contains an invalid article link': 'error.feedItem',
  'Feed is not safe, well-formed XML': 'error.feedXml',
  'Expected RSS or Atom feed': 'error.feedXml',
  'Feed exceeds the 2000-item limit': 'error.feedItemLimit',
  'Feed contains a malformed item': 'error.feedItem',
  'Feed response exceeds size limit': 'error.feedSize',
  'Feed response is empty': 'error.feedEmpty',
  'Incorrect channel target': 'error.channelTarget',
  'Slack request failed or timed out': 'error.slackNetwork',
  'Local mail transport could not be started': 'error.mailStart',
  'Local mail transport timed out': 'error.mailTimeout',
  'Invalid notification subject': 'error.notificationSubject',
  'Notification channel is unavailable': 'error.channelUnavailable',
  'Notification could not be accepted': 'error.notificationRejected',
  'Failed to fetch': 'error.network',
  'fetch failed': 'error.network',
  'NetworkError when attempting to fetch resource.': 'error.network',
};
const codeKeys: Record<string, SystemMessageKey> = {
  UNAUTHORIZED: 'error.sessionExpired',
  FORBIDDEN: 'error.adminRequired',
  NOT_FOUND: 'error.notFound',
  BAD_REQUEST: 'error.invalidInput',
  CONFLICT: 'error.conflict',
  INTERNAL_SERVER_ERROR: 'error.server',
  TIMEOUT: 'error.timeout',
  TOO_MANY_REQUESTS: 'error.rateLimit',
};
function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
function keyForText(text: string): SystemMessageKey | undefined {
  const alias = Object.hasOwn(aliases, text) ? aliases[text] : undefined;
  if (alias) return alias;
  for (const [key, english] of Object.entries(en)) {
    if (text === english || text === hu[key as SystemMessageKey]) return key as SystemMessageKey;
  }
  if (/^Sign-in exchange failed \(\d+\)\./u.test(text)) return 'error.authConfiguration';
  if (/^Server sign-out failed \(\d+\)/u.test(text)) return 'error.signOutServer';
  if (/^Invalid (query|label|destination label|source ID)$/u.test(text))
    return 'error.invalidInput';
  return undefined;
}
export function describeError(error: unknown): SystemMessage {
  const record = object(error);
  if (isSystemKey(record?.['messageKey'])) {
    const values = object(record['messageParams']);
    const messageParams = values
      ? Object.fromEntries(
          Object.entries(values).filter(
            (entry): entry is [string, string | number] =>
              typeof entry[1] === 'string' ||
              (typeof entry[1] === 'number' && Number.isFinite(entry[1])),
          ),
        )
      : undefined;
    return { messageKey: record['messageKey'], ...(messageParams ? { messageParams } : {}) };
  }
  const text = typeof error === 'string' ? error : record?.['message'];
  if (typeof text === 'string') {
    const patterns: readonly [RegExp, SystemMessageKey][] = [
      [/^Feed request failed \(HTTP (\d{3})\)$/u, 'error.feedHttp'],
      [/^Slack rejected the notification \(HTTP (\d{3})\)$/u, 'error.slackHttp'],
      [/^Local mail transport rejected submission \(exit (\d+)\)$/u, 'error.mailRejected'],
    ];
    for (const [pattern, messageKey] of patterns) {
      const match = pattern.exec(text);
      if (match?.[1]) return { messageKey, messageParams: { status: Number(match[1]) } };
    }
  }
  const mapped = typeof text === 'string' ? keyForText(text) : undefined;
  if (mapped) return { messageKey: mapped };
  const data = object(record?.['data']);
  const code = data?.['code'] ?? record?.['code'];
  if (typeof code === 'string' && Object.hasOwn(codeKeys, code) && codeKeys[code])
    return { messageKey: codeKeys[code] };
  const name = record?.['name'];
  if (name === 'TimeoutError') return { messageKey: 'error.timeout' };
  if (name === 'AbortError') return { messageKey: 'error.cancelled' };
  if (name === 'ZodError') return { messageKey: 'error.invalidInput' };
  return { messageKey: 'error.generic' };
}
export function localizeError(error: unknown, t: Translator): string {
  const descriptor = describeError(error);
  return t(descriptor.messageKey, descriptor.messageParams);
}
export function translateActionResult(result: SavedMessage, t: Translator): string {
  if (result.messageKey === 'sync.success') {
    const count = result.feedCount ?? result.messageParams?.['count'];
    const skipped = result.emailOnlyCount ?? result.messageParams?.['skipped'];
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      return [
        t('sync.success', { count }),
        typeof skipped === 'number' && skipped > 0 ? t('sync.skipped', { count: skipped }) : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
  }
  if (isSystemKey(result.messageKey)) return t(result.messageKey, result.messageParams);
  const known = keyForText(result.message);
  if (known) return t(known);
  // Older versions saved already-rendered counts. Preserve their information when switching languages.
  const previous =
    /^(\d+) RSS feeds? synced\.(?: (\d+) email-only alerts? (?:was|were) skipped\.)?$/u.exec(
      result.message,
    );
  if (previous)
    return translateActionResult(
      {
        message: '',
        messageKey: 'sync.success',
        feedCount: Number(previous[1]),
        emailOnlyCount: Number(previous[2] ?? 0),
      },
      t,
    );
  return localizeError(result.message, t);
}
export function translateSyncStatus(status: SavedMessage, t: Translator): string {
  if (!status.messageKey && status.state === 'syncing') return t('sync.replacing');
  if (!status.messageKey && status.state === 'idle') return t('sync.idle');
  return translateActionResult(status, t);
}
