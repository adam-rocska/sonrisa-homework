import { describe, expect, it, vi } from 'vitest';
import {
  createSendmailChannel,
  createSlackChannel,
  DeliveryError,
  renderEmail,
} from '../src/index.js';
import type { Notification } from '../src/index.js';
const notification: Notification = {
  id: 'notification-1',
  title: 'Árvíz & hírek',
  url: 'https://example.test/article',
  query: 'flood',
  publishedAt: null,
};
const slackTarget = {
  kind: 'slack' as const,
  target: 'https://hooks.slack.com/services/T1/B2/SECRET',
};
describe('Slack adapter', () => {
  it('posts plaintext JSON and reports acceptance', async () => {
    const fetcher = vi.fn(async () => new Response('ok'));
    const channel = createSlackChannel({ fetch: fetcher });
    await expect(channel.send(slackTarget, notification)).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(fetcher).toHaveBeenCalledWith(
      slackTarget.target,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: expect.stringContaining('"mrkdwn":false'),
      }),
    );
  });
  it('honours bounded Retry-After and never exposes Slack response bodies', async () => {
    const channel = createSlackChannel({
      fetch: async () =>
        new Response('SECRET private channel', { status: 429, headers: { 'retry-after': '120' } }),
    });
    await expect(channel.send(slackTarget, notification)).rejects.toMatchObject({
      retryable: true,
      retryAfterMs: 120_000,
      message: 'Slack rejected the notification (HTTP 429)',
    });
  });
  it('classifies permanent errors and prevents redirect destinations', async () => {
    const channel = createSlackChannel({
      fetch: async () => new Response('invalid', { status: 400 }),
    });
    await expect(channel.send(slackTarget, notification)).rejects.toMatchObject({
      retryable: false,
    });
    await expect(
      channel.send({ kind: 'slack', target: 'https://evil.test/services/A/B/C' }, notification),
    ).rejects.toThrow();
  });
  it('replaces network error details with a safe message', async () => {
    const channel = createSlackChannel({
      fetch: async () => {
        throw new Error('https://hooks.slack.com/services/SECRET');
      },
    });
    await expect(channel.send(slackTarget, notification)).rejects.toMatchObject({
      message: 'Slack request failed or timed out',
    });
  });
});
describe('local sendmail adapter', () => {
  it('uses argument arrays, stdin, stable IDs and explicit local acceptance semantics', async () => {
    const run = vi.fn(async () => ({ exitCode: 0 }));
    const channel = createSendmailChannel({
      from: 'sender@example.test',
      executable: '/usr/sbin/sendmail',
      run,
    });
    const result = await channel.send({ kind: 'email', target: 'user@example.test' }, notification);
    expect(result.detail).toContain('inbox delivery is not confirmed');
    expect(run).toHaveBeenCalledWith(
      '/usr/sbin/sendmail',
      ['-i', '-f', 'sender@example.test', '--', 'user@example.test'],
      expect.stringContaining('Message-ID: <signalpost-'),
      10_000,
    );
    expect(renderEmail('sender@example.test', 'user@example.test', notification)).toBe(
      renderEmail('sender@example.test', 'user@example.test', notification),
    );
  });
  it('rejects subject and recipient header injection', async () => {
    expect(() =>
      renderEmail(
        'sender@example.test',
        'user@example.test\r\nBcc: attacker@example.test',
        notification,
      ),
    ).toThrow();
    expect(() =>
      renderEmail('sender@example.test', 'user@example.test', {
        ...notification,
        title: 'Subject\r\nBcc: attacker@example.test',
      }),
    ).toThrow(DeliveryError);
  });
  it('encodes Unicode and keeps MIME header/body lines bounded', () => {
    const rendered = renderEmail('sender@example.test', 'user@example.test', {
      ...notification,
      title: '🌍Á'.repeat(200),
    });
    expect(rendered).toContain('Content-Transfer-Encoding: base64');
    expect(Math.max(...rendered.split('\r\n').map((line) => Buffer.byteLength(line)))).toBeLessThan(
      998,
    );
    expect(rendered).not.toContain('🌍');
  });
  it('retries unsuccessful process submissions without claiming delivery', async () => {
    const channel = createSendmailChannel({
      from: 'sender@example.test',
      run: async () => ({ exitCode: 75 }),
    });
    await expect(
      channel.send({ kind: 'email', target: 'user@example.test' }, notification),
    ).rejects.toMatchObject({
      retryable: true,
      message: 'Local mail transport rejected submission (exit 75)',
    });
  });
});
