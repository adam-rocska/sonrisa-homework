import { describe, expect, it } from 'vitest';
import { createTranslator } from './index';
import {
  describeError,
  localizeError,
  LocalizedError,
  translateActionResult,
  translateSyncStatus,
} from './errors';
import { resultSchema } from '../infrastructure/protocol';
import { syncStatusSchema } from '../infrastructure/storage';

const english = createTranslator('en');
const hungarian = createTranslator('hu');

describe('localized system messages', () => {
  it('keeps structured status counts and re-renders them after a language change', () => {
    const status = syncStatusSchema.parse({
      state: 'success',
      at: '2026-10-18T00:00:00.000Z',
      message: 'stale rendered value',
      messageKey: 'sync.success',
      messageParams: { count: 1, skipped: 2 },
    });
    expect(translateSyncStatus(status, english)).toBe(
      '1 RSS feed synced. 2 email-only alerts were skipped.',
    );
    expect(translateSyncStatus(status, hungarian)).toBe(
      '1 RSS-forrás szinkronizálva. 2 csak e-mailes értesítést kihagytunk.',
    );
  });
  it('reads legacy successful status text including singular skipped counts', () => {
    const status = syncStatusSchema.parse({
      state: 'success',
      at: '2026-10-18T00:00:00.000Z',
      message: '2 RSS feeds synced. 1 email-only alert was skipped.',
    });
    expect(translateSyncStatus(status, hungarian)).toBe(
      '2 RSS-forrás szinkronizálva. 1 csak e-mailes értesítést kihagytunk.',
    );
  });
  it('preserves descriptors when action results cross the message boundary', () => {
    const action = resultSchema.parse({
      ok: false,
      message: 'old text',
      messageKey: 'error.alertsSignIn',
    });
    expect(translateActionResult(action, hungarian)).toBe(hungarian('error.alertsSignIn'));
  });
  it('localizes app exceptions and already rendered known messages in either direction', () => {
    expect(localizeError(new LocalizedError('error.sourceMismatch'), hungarian)).toBe(
      hungarian('error.sourceMismatch'),
    );
    expect(
      localizeError(new Error('Your Signalpost session expired. Sign in again.'), hungarian),
    ).toBe(hungarian('error.sessionExpired'));
    expect(localizeError(hungarian('error.sessionExpired'), english)).toBe(
      english('error.sessionExpired'),
    );
    expect(
      localizeError(
        new Error('Server access was not granted. Your settings were not changed.'),
        hungarian,
      ),
    ).toBe(hungarian('error.serverPermission'));
  });
  it('uses tRPC codes for unknown server wording and a safe fallback for unknown exceptions', () => {
    expect(
      localizeError({ message: 'unrecognized', data: { code: 'UNAUTHORIZED' } }, hungarian),
    ).toBe(hungarian('error.sessionExpired'));
    expect(localizeError(new Error('private token: secret'), hungarian)).toBe(
      hungarian('error.generic'),
    );
    expect(localizeError('__proto__', hungarian)).toBe(hungarian('error.generic'));
    expect(localizeError({ code: 'constructor' }, hungarian)).toBe(hungarian('error.generic'));
  });
  it('preserves useful provider error codes while localizing safe fixed diagnostics', () => {
    expect(localizeError('Slack rejected the notification (HTTP 429)', hungarian)).toBe(
      'A Slack elutasította az értesítést (HTTP 429).',
    );
    expect(localizeError('Feed request failed (HTTP 503)', hungarian)).toBe(
      'A forrás lekérése sikertelen (HTTP 503).',
    );
    expect(localizeError('Local mail transport rejected submission (exit 75)', hungarian)).toBe(
      'A helyi levélküldő elutasította az átadást (kilépési kód: 75).',
    );
    const message = describeError('Slack rejected the notification (HTTP 429)');
    expect(localizeError(message, english)).toBe('Slack rejected the notification (HTTP 429).');
  });
  it('recognizes malformed feed, transport and timeout errors without raw English leaks', () => {
    expect(localizeError('Feed is not safe, well-formed XML', hungarian)).toBe(
      hungarian('error.feedXml'),
    );
    expect(localizeError('Local mail transport could not be started', hungarian)).toBe(
      hungarian('error.mailStart'),
    );
    expect(localizeError(new DOMException('unlocalized text', 'TimeoutError'), hungarian)).toBe(
      hungarian('error.timeout'),
    );
  });
});
