import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';

// Invoked as a real child process by runSendmail. The wrapper supplies only
// this private receipt path; the remaining arguments are the adapter's argv.
const [receiptPath, ...args] = process.argv.slice(2);
assert(receiptPath, 'Missing isolated mail receipt path');
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
await appendFile(
  receiptPath,
  `${JSON.stringify({ args, input: Buffer.concat(chunks).toString('utf8') })}\n`,
  { mode: 0o600 },
);
