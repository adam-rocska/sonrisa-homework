import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DeliveryError, validateTarget } from './domain.js';
import type { DeliveryTarget, Notification, NotificationChannel } from './domain.js';
import type { FetchFunction } from './feed.js';

export function createSlackChannel(
  options: { readonly fetch?: FetchFunction; readonly timeoutMs?: number } = {},
): NotificationChannel {
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    kind: 'slack',
    async send(target: DeliveryTarget, notification: Notification) {
      if (target.kind !== 'slack') throw new DeliveryError('Incorrect channel target', false);
      const url = validateTarget('slack', target.target);
      let response: Response;
      try {
        response = await fetcher(url, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: `${notification.title}\n${notification.url}\nAlert: ${notification.query}`.slice(
              0,
              12_000,
            ),
            mrkdwn: false,
            unfurl_links: false,
            unfurl_media: false,
          }),
        });
      } catch {
        throw new DeliveryError('Slack request failed or timed out');
      }
      await response.body?.cancel();
      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        const seconds = Number(response.headers.get('retry-after'));
        throw new DeliveryError(
          `Slack rejected the notification (HTTP ${response.status})`,
          retryable,
          Number.isFinite(seconds) && seconds > 0 ? Math.min(3600, seconds) * 1000 : undefined,
        );
      }
      return { status: 'accepted', detail: 'Slack webhook accepted the message' };
    },
  };
}
export interface CommandResult {
  readonly exitCode: number;
}
export type CommandRunner = (
  program: string,
  args: readonly string[],
  input: string,
  timeoutMs: number,
) => Promise<CommandResult>;
export const runSendmail: CommandRunner = async (program, args, input, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(program, [...args], {
      shell: false,
      stdio: ['pipe', 'ignore', 'pipe'],
      env: {
        PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
        NODE_ENV: process.env.NODE_ENV ?? 'production',
      },
    });
    let settled = false;
    let timedOut = false;
    const finish = (error?: Error, code = 0): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) reject(error);
      else resolve({ exitCode: code });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timeout.unref();
    // Drain but never retain or expose process output, which may contain addresses.
    child.stderr.on('data', () => undefined);
    child.on('error', () => finish(new DeliveryError('Local mail transport could not be started')));
    child.on('close', (code) =>
      finish(timedOut ? new DeliveryError('Local mail transport timed out') : undefined, code ?? 1),
    );
    child.stdin.on('error', () => {
      /* A failed child is handled by its close/error event. */
    });
    child.stdin.end(input);
  });
function encodedSubject(value: string): string {
  // eslint-disable-next-line no-control-regex -- Reject mail header injection, including embedded NUL.
  if (/[\r\n\u0000]/u.test(value)) throw new DeliveryError('Invalid notification subject', false);
  const chunks: string[] = [];
  let chunk = '';
  for (const char of [...value].slice(0, 180)) {
    if (Buffer.byteLength(chunk + char, 'utf8') > 39) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += char;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks.map((part) => `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`).join('\r\n ');
}
export function renderEmail(from: string, to: string, notification: Notification): string {
  validateTarget('email', from);
  validateTarget('email', to);
  const messageId = createHash('sha256').update(notification.id).digest('hex');
  const body = `${notification.title}\n\n${notification.url}\n\nGoogle Alert: ${notification.query}\n`;
  const encodedBody =
    Buffer.from(body, 'utf8')
      .toString('base64')
      .match(/.{1,76}/gu)
      ?.join('\r\n') ?? '';
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject(`Signalpost: ${notification.title}`)}`,
    `Message-ID: <signalpost-${messageId}@localhost>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
    '',
  ].join('\r\n');
}
export function createSendmailChannel(options: {
  readonly from: string;
  readonly executable?: string;
  readonly timeoutMs?: number;
  readonly run?: CommandRunner;
}): NotificationChannel {
  const from = validateTarget('email', options.from);
  const executable = options.executable ?? '/usr/sbin/sendmail';
  // eslint-disable-next-line no-control-regex -- Executable paths cannot contain NUL or line breaks.
  if (!executable.startsWith('/') || /[\r\n\u0000]/u.test(executable))
    throw new Error('Mail executable must be an absolute path');
  const run = options.run ?? runSendmail;
  return {
    kind: 'email',
    async send(target, notification) {
      if (target.kind !== 'email') throw new DeliveryError('Incorrect channel target', false);
      const to = validateTarget('email', target.target);
      const result = await run(
        executable,
        ['-i', '-f', from, '--', to],
        renderEmail(from, to, notification),
        options.timeoutMs ?? 10_000,
      );
      if (result.exitCode !== 0)
        throw new DeliveryError(
          `Local mail transport rejected submission (exit ${result.exitCode})`,
        );
      return {
        status: 'accepted',
        detail: 'Local mail transport accepted the message; inbox delivery is not confirmed',
      };
    },
  };
}
