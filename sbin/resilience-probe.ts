import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(join(tmpdir(), 'signalpost-recovery-'));
const database = join(directory, 'state.sqlite');
const receipts = join(directory, 'receipts.txt');
const worker = fileURLToPath(new URL('../share/test/resilience-worker.ts', import.meta.url));
interface Result { event: string; deliveries?: { state: string; attempts: number }[] }
async function run(phase: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = fork(worker, [database, receipts, phase], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let result: Result | undefined;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Probe phase timed out: ${phase}`)); }, 15_000);
    child.on('message', (message: Result) => {
      result = message;
      if (phase === 'crash' && message.event === 'delivery-leased') child.kill('SIGKILL');
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (phase === 'crash' && signal === 'SIGKILL' && result?.event === 'delivery-leased') resolve(result);
      else if (code === 0 && result?.event === 'complete') resolve(result);
      else reject(new Error(`Probe failed: ${phase}, code=${code}, signal=${signal}, ${stderr}`));
    });
  });
}
try {
  const seeded = await run('seed');
  assert.deepEqual(seeded.deliveries, [], 'First poll must not replay old entries');
  await run('crash');
  const recovered = await run('recover');
  assert.deepEqual(recovered.deliveries, [{ state: 'accepted', attempts: 2 }]);
  const repeated = await run('recover');
  assert.deepEqual(repeated.deliveries, [{ state: 'accepted', attempts: 2 }]);
  assert.equal(readFileSync(receipts, 'utf8').trim().split('\n').length, 1, 'Exactly one sink receipt in this pre-acceptance crash scenario');
  console.log('PASS: baseline, SIGKILL during delivery, durable retry after restart, deduplication on second restart.');
  console.log('Scope: isolated file sink; does not prove remote exactly-once or real email/Slack delivery.');
} finally { rmSync(directory, { recursive: true, force: true }); }
