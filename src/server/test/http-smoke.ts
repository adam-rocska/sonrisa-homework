import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/** Small isolated process probe. No OAuth, feed, webhook or email traffic. */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'signalpost-http-smoke-'));
const portReservation = createServer();
portReservation.listen(0, '127.0.0.1');
await once(portReservation, 'listening');
const address = portReservation.address();
assert(address !== null && typeof address === 'object');
const port = address.port;
await new Promise<void>((resolve, reject) =>
  portReservation.close((error) => (error === undefined ? resolve() : reject(error))),
);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/src/main.ts'], {
  cwd: root,
  // Do not inherit Google credentials, destinations, or local configuration.
  env: {
    PATH: process.env['PATH'] ?? '',
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    BETTER_AUTH_URL: baseUrl,
    DATA_DIRECTORY: directory,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let logs = '';
child.stdout.on('data', (chunk: Buffer) => {
  logs = (logs + chunk.toString()).slice(-8192);
});
child.stderr.on('data', (chunk: Buffer) => {
  logs = (logs + chunk.toString()).slice(-8192);
});
const started = performance.now();
const results: Record<string, unknown> = {
  server: 'separate Node process',
  auth: 'unconfigured',
  requests: 100,
};

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(3_000) });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before readiness: ${logs}`);
    try {
      const health = await request('/healthz');
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: 'ok', authentication: 'unconfigured' });
      ready = true;
      break;
    } catch {
      await delay(50);
    }
  }
  assert(ready, `Server did not become healthy: ${logs}`);
  results['health'] = 200;
  const anonymous = await request('/trpc/catalog.get');
  assert.equal(anonymous.status, 401);
  await anonymous.arrayBuffer();
  results['unauthenticatedCatalog'] = 401;
  const oversized = await request('/trpc/catalog.replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'x'.repeat(1_048_577),
  });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get('Connection'), 'close');
  await oversized.arrayBuffer();
  results['oversizedBody'] = 413;
  const tooMany = Array.from({ length: 21 }, () => 'me').join(',');
  const batch = await request(`/trpc/${tooMany}?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(batch.status, 400);
  assert.match(await batch.text(), /Batch call exceeds maximum size/u);
  results['oversizedBatch'] = 400;
  const burstStarted = performance.now();
  const requests = Array.from({ length: 100 }, async (_, index) => {
    const response = await request(index % 2 === 0 ? '/healthz' : '/trpc/me');
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  });
  await Promise.all(requests);
  results['burstPassed'] = 100;
  results['burstMilliseconds'] = Math.round(performance.now() - burstStarted);
  const finalHealth = await request('/healthz');
  assert.equal(finalHealth.status, 200);
  await finalHealth.arrayBuffer();
  const shutdownStarted = performance.now();
  assert(child.kill('SIGTERM'));
  const timeout = new AbortController();
  const exit = await Promise.race([
    exited,
    delay(5_000, undefined, { signal: timeout.signal }).then(() => {
      throw new Error(`SIGTERM did not stop the server: ${logs}`);
    }),
  ]);
  timeout.abort();
  assert.equal(exit[0], 0, logs);
  assert.equal(exit[1], null, logs);
  results['sigtermExit'] = 0;
  results['shutdownMilliseconds'] = Math.round(performance.now() - shutdownStarted);
  results['totalMilliseconds'] = Math.round(performance.now() - started);
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
