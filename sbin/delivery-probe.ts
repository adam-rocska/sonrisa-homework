import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTarget } from '../src/core/src/index.js';

interface DeliveryResult {
  kind: 'email' | 'slack';
  state: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  title: string;
  url: string;
}
interface WorkerResult {
  event: string;
  phase: string;
  baselineAt: string | null;
  feedError: string | null;
  deliveries: DeliveryResult[];
}
interface MailReceipt {
  args: string[];
  input: string;
}
interface WebhookReceipt {
  method: string | undefined;
  contentType: string | undefined;
  body: unknown;
}

const arguments_ = process.argv.slice(2);
let captureEmail: string | undefined;
let emailAddress: string | undefined;
for (let index = 0; index < arguments_.length; index += 2) {
  const option = arguments_[index];
  const value = arguments_[index + 1];
  assert(value && !value.startsWith('--'), 'Each probe option needs a value');
  if (option === '--capture-email' && captureEmail === undefined) {
    assert(isAbsolute(value), '--capture-email needs an absolute new file path');
    captureEmail = value;
  } else if (option === '--email-address' && emailAddress === undefined) {
    emailAddress = validateTarget('email', value);
  } else {
    throw new Error('Expected unique --capture-email and --email-address options');
  }
}
assert(
  emailAddress === undefined || captureEmail !== undefined,
  '--email-address requires --capture-email; capture never sends email',
);
const sender = emailAddress ?? 'sender@example.invalid';
const recipient = emailAddress ?? 'recipient@example.invalid';
const marker = `sp-${randomUUID()}`;

const root = fileURLToPath(new URL('../', import.meta.url));
const worker = fileURLToPath(new URL('../share/test/delivery-worker.ts', import.meta.url));
const sink = fileURLToPath(new URL('../share/test/sendmail-sink.ts', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'signalpost-delivery-'));
const database = join(directory, 'application.sqlite');
const receipts = join(directory, 'mail.jsonl');
const sendmail = join(directory, 'sendmail');
const title = `Signalpost próba – árvíz & hírek 🌍 [${marker}]`;
const article = 'https://example.invalid/signalpost-delivery-probe';
const query = 'árvíz "teszt" & hírek';
const webhookReceipts: WebhookReceipt[] = [];
let published = false;
let feedRequests = 0;
let fixtureError: unknown;
const xml = () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Isolated Signalpost probe</title>
<item><guid>existing-item</guid><title>Existing item</title><link>https://example.invalid/existing</link></item>
${published ? `<item><guid>new-item</guid><title>${title.replaceAll('&', '&amp;')}</title><link>${article}</link><pubDate>Thu, 01 Jan 2026 00:00:01 GMT</pubDate></item>` : ''}
</channel></rss>`;
const server = createServer((request, response) => {
  void (async () => {
    if (request.url === '/feed.xml') {
      assert.equal(request.method, 'GET');
      assert.match(request.headers.accept ?? '', /application\/rss\+xml/u);
      feedRequests += 1;
      response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      response.end(xml());
      return;
    }
    assert.equal(request.url, '/services/PROBE/ONLY/NOT_A_SECRET');
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
    webhookReceipts.push({
      method: request.method,
      contentType: request.headers['content-type'],
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
    });
    if (webhookReceipts.length === 1) {
      response.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '1' });
      response.end('rate_limited');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('ok');
    }
  })().catch((error: unknown) => {
    fixtureError = error;
    response.writeHead(500);
    response.end('fixture_failure');
  });
});

const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
async function mailReceipts(): Promise<MailReceipt[]> {
  const lines = await readFile(receipts, 'utf8');
  return lines.trim().length === 0
    ? []
    : lines
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as MailReceipt);
}
async function run(phase: string, origin: string): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = fork(
      worker,
      [database, origin, sendmail, phase, JSON.stringify({ sender, recipient })],
      {
        cwd: root,
        execArgv: ['--import', 'tsx'],
        // No real OAuth, feed URLs, mail configuration, or webhook secrets.
        env: { PATH: process.env['PATH'] ?? '', NODE_ENV: 'test' },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    let result: WorkerResult | undefined;
    let stderr = '';
    let timedOut = false;
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    child.on('message', (message: WorkerResult) => {
      result = message;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 15_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && result?.event === 'complete' && result.phase === phase) resolve(result);
      else
        reject(
          new Error(
            `Delivery probe ${phase} failed: code=${code}, signal=${signal}, timeout=${timedOut}, ${stderr}`,
          ),
        );
    });
  });
}
function byKind(result: WorkerResult, kind: 'email' | 'slack'): DeliveryResult {
  assert.equal(result.feedError, null);
  const delivery = result.deliveries.find((candidate) => candidate.kind === kind);
  assert(delivery, `Missing ${kind} delivery`);
  assert.equal(delivery.title, title);
  assert.equal(delivery.url, article);
  return delivery;
}

try {
  await writeFile(receipts, '', { mode: 0o600 });
  await writeFile(
    sendmail,
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(sink)} ${shellQuote(receipts)} "$@"\n`,
    { mode: 0o700 },
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address !== null && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const baseline = await run('baseline', origin);
  assert.equal(baseline.baselineAt, '2026-01-01T00:00:00.000Z');
  assert.equal(baseline.feedError, null);
  assert.deepEqual(baseline.deliveries, []);
  assert.deepEqual(await mailReceipts(), []);
  assert.equal(webhookReceipts.length, 0);
  assert.equal(feedRequests, 1);

  published = true;
  const initial = await run('publish', origin);
  assert.equal(initial.deliveries.length, 2);
  const email = byKind(initial, 'email');
  assert.equal(email.state, 'accepted');
  assert.equal(email.attempts, 1);
  const slack = byKind(initial, 'slack');
  assert.equal(slack.state, 'pending');
  assert.equal(slack.attempts, 1);
  assert.equal(slack.lastError, 'Slack rejected the notification (HTTP 429)');
  assert.equal(slack.nextAttemptAt, '2026-01-01T00:00:02.000Z');
  assert.equal(webhookReceipts.length, 1);
  assert.equal((await mailReceipts()).length, 1);

  const waiting = await run('waiting', origin);
  assert.deepEqual(waiting.deliveries, initial.deliveries);
  assert.equal(webhookReceipts.length, 1, 'Do not retry before Retry-After');
  assert.equal(feedRequests, 2);

  const retry = await run('retry', origin);
  assert.equal(retry.deliveries.length, 2);
  assert.equal(byKind(retry, 'slack').state, 'accepted');
  assert.equal(byKind(retry, 'slack').attempts, 2);
  assert.equal(byKind(retry, 'slack').lastError, null);
  assert.equal(byKind(retry, 'email').attempts, 1);
  const repeated = await run('repeat', origin);
  assert.deepEqual(repeated.deliveries, retry.deliveries);
  assert.equal(feedRequests, 4);
  assert.equal(webhookReceipts.length, 2, 'Repeated RSS must not send another webhook');
  assert.deepEqual(webhookReceipts[0], webhookReceipts[1], 'Retry must preserve the message');
  assert.deepEqual(webhookReceipts[0], {
    method: 'POST',
    contentType: 'application/json',
    body: {
      text: `${title}\n${article}\nAlert: ${query}`,
      mrkdwn: false,
      unfurl_links: false,
      unfurl_media: false,
    },
  });
  const messages = await mailReceipts();
  assert.equal(messages.length, 1, 'Slack retry must not resend accepted mail');
  const message = messages[0];
  assert(message);
  assert.deepEqual(message.args, ['-i', '-f', sender, '--', recipient]);
  const [headers, body] = message.input.split('\r\n\r\n');
  assert(headers !== undefined && body !== undefined);
  assert(headers.startsWith(`From: ${sender}\r\nTo: ${recipient}\r\n`));
  assert.match(headers, /Message-ID: <signalpost-[a-f0-9]{64}@localhost>/u);
  assert.match(headers, /Content-Type: text\/plain; charset=UTF-8/u);
  assert.match(headers, /Content-Transfer-Encoding: base64/u);
  const subject = headers.replaceAll('\r\n ', '').match(/^Subject: (.+)$/mu)?.[1];
  assert(subject);
  const decodedSubject = [...subject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/gu)]
    .map((match) => Buffer.from(match[1] ?? '', 'base64').toString('utf8'))
    .join('');
  assert.equal(decodedSubject, `Signalpost: ${title}`);
  assert.equal(
    Buffer.from(body.replaceAll('\r\n', ''), 'base64').toString('utf8'),
    `${title}\n\n${article}\n\nGoogle Alert: ${query}\n`,
  );
  assert.equal(fixtureError, undefined);
  if (captureEmail !== undefined) {
    await writeFile(captureEmail, message.input, { mode: 0o600, flag: 'wx' });
    console.log(`Captured local-process MIME only: ${captureEmail}`);
  }
  console.log(`Unique test marker: ${marker}`);
  console.log(
    'PASS: HTTP RSS baseline → new item → SQLite outbox → real sendmail subprocess + Slack HTTP adapter.',
  );
  console.log(
    'PASS: UTF-8 MIME/JSON payloads; Slack 429/Retry-After; process restart recovery; no repeated mail or webhook.',
  );
  console.log(
    'Evidence: 5 isolated workers, 4 RSS GETs, 2 webhook POSTs (429 then 200), 1 MIME receipt, 2 accepted deliveries.',
  );
  console.log(
    'Scope: local protocol/process sinks; no real Slack workspace, Google feed, OAuth/UI, SMTP or Gmail inbox receipt.',
  );
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) =>
      error && 'code' in error && error.code !== 'ERR_SERVER_NOT_RUNNING'
        ? reject(error)
        : resolve(),
    );
    server.closeAllConnections();
  });
  await rm(directory, { recursive: true, force: true });
}
