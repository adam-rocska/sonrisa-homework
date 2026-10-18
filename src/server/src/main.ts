import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import {
  createPoller,
  createSendmailChannel,
  createSlackChannel,
  createStore,
  DeliveryError,
  type NotificationChannel,
} from '@signalpost/core';
import { createApp } from './app.js';
import { createGoogleAuth } from './auth.js';
import { readConfig } from './config.js';

async function main(): Promise<void> {
  const config = readConfig(process.env);
  mkdirSync(config.dataDirectory, { recursive: true, mode: 0o700 });
  const store = createStore(join(config.dataDirectory, 'application.sqlite'));
  const auth = await createGoogleAuth(config);
  const email: NotificationChannel =
    config.mailFrom === undefined
      ? {
          kind: 'email',
          async send() {
            throw new DeliveryError(
              'Email transport needs MAIL_FROM and a working local sendmail-compatible MTA.',
              false,
            );
          },
        }
      : createSendmailChannel({ from: config.mailFrom, executable: config.sendmailPath });
  const poller = createPoller({
    store,
    channels: [createSlackChannel(), email],
    pollIntervalMs: config.pollIntervalMs,
    requestTimeoutMs: 10_000,
    onError: () => process.stderr.write(`${JSON.stringify({ event: 'poller_failure' })}\n`),
  });
  const app = createApp({ config, auth, store });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
    process.stdout.write(
      `${JSON.stringify({ event: 'server_listening', host: config.host, port: config.port, authentication: auth.configured ? 'configured' : 'unconfigured' })}\n`,
    );
  });
  poller.start();
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 30_000);
    deadline.unref();
    const httpClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    void Promise.all([httpClosed, poller.stop()]).finally(() => {
      auth.close();
      store.close();
      clearTimeout(deadline);
    });
    if ('closeIdleConnections' in server) server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ event: 'startup_failure', message: error instanceof Error ? error.message : 'Unknown startup error' })}\n`,
  );
  process.exitCode = 1;
});
