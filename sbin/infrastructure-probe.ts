import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = join(root, 'var/tmp');
await mkdir(temporaryRoot, { recursive: true });
const directory = await mkdtemp(join(temporaryRoot, 'infrastructure-probe-'));
const state = join(directory, 'state');
const rendered = join(directory, 'rendered');
const cache = join(root, 'var/cache/pulumi-probe');
const cli = process.env['PULUMI_CLI'] ?? 'pulumi';
await Promise.all([mkdir(state), mkdir(cache, { recursive: true, mode: 0o700 })]);
const environment: NodeJS.ProcessEnv = {
  PATH: process.env['PATH'] ?? '',
  USER: userInfo().username,
  // Preserve the real home for the macOS CLI user lookup; PULUMI_HOME isolates all state.
  HOME: process.env['HOME'] ?? userInfo().homedir,
  PULUMI_HOME: cache,
  PULUMI_BACKEND_URL: pathToFileURL(state).href,
  PULUMI_CONFIG_PASSPHRASE: randomBytes(32).toString('hex'),
  PULUMI_SKIP_UPDATE_CHECK: 'true',
  SIGNALPOST_RENDER_DIRECTORY: rendered,
};
function pulumi(args: readonly string[], input?: string): string {
  return execFileSync(cli, [...args, '--non-interactive'], {
    cwd: directory,
    env: environment,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
async function files(path: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await files(name)));
    else result.push(name);
  }
  return result;
}
try {
  await writeFile(
    join(directory, 'Pulumi.yaml'),
    JSON.stringify({
      name: 'signalpost-offline-probe',
      runtime: { name: 'nodejs', options: { typescript: false, nodeargs: '--import tsx' } },
      main: join(root, 'src/infrastructure/share/test/offline-program.ts'),
    }),
  );
  pulumi(['stack', 'init', 'probe', '--secrets-provider', 'passphrase']);
  const smtpFixture = 'defaults\ntls on\naccount default\nhost smtp.example.invalid\n';
  pulumi(['config', 'set', '--secret', 'smtpConfiguration'], smtpFixture);
  assert.equal(pulumi(['config', 'get', 'smtpConfiguration']).trimEnd(), smtpFixture.trimEnd());
  const preview = pulumi(['preview', '--stack', 'probe']);
  assert.match(preview, /PersistentVolumeClaim/u);
  pulumi(['up', '--stack', 'probe', '--yes', '--skip-preview']);
  const manifests = await files(rendered);
  const documents = await Promise.all(
    manifests.filter((path) => /\.ya?ml$/u.test(path)).map((path) => readFile(path, 'utf8')),
  );
  const kinds = documents.map((text) => /^kind: (\S+)$/mu.exec(text)?.[1]);
  for (const kind of ['Deployment', 'PersistentVolumeClaim', 'Secret', 'Service']) {
    assert.equal(kinds.filter((candidate) => candidate === kind).length, 1, kind);
  }
  const deployment = documents[kinds.indexOf('Deployment')];
  assert(deployment !== undefined);
  assert.match(deployment, /replicas: 1/u);
  assert.match(deployment, /type: Recreate/u);
  assert.match(deployment, /readOnlyRootFilesystem: true/u);
  assert.match(deployment, /mountPath: \/var\/lib\/signalpost/u);
  assert(!documents.some((document) => /type: LoadBalancer/u.test(document)));
  const output = JSON.parse(pulumi(['stack', 'output', '--stack', 'probe', '--json'])) as Record<
    string,
    unknown
  >;
  assert.equal(
    output['oauthCallbackUrl'],
    'https://signalpost.example.invalid/api/auth/callback/google',
  );
  assert(!JSON.stringify(output).includes('fixture-google-secret'));
  const stateExport = pulumi(['stack', 'export', '--stack', 'probe']);
  assert(!stateExport.includes('fixture-google-secret'));
  assert(!stateExport.includes('fixture-auth-secret-at-least-32-characters'));
  console.log(
    JSON.stringify({
      status: 'passed',
      provider: 'actual Pulumi Kubernetes YAML renderer',
      manifestKinds: kinds,
      stateSecretsEncrypted: true,
      multilineSecretInputPreserved: true,
      liveClusterUsed: false,
      containersStarted: false,
    }),
  );
} finally {
  // The YAML-only provider never contacts a cluster. These are disposable local files,
  // including plaintext fixture-only Secret YAML; deleting them destroys no resources.
  await rm(directory, { recursive: true, force: true });
}
