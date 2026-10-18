import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../sbin/finalize-runtime.mjs', import.meta.url));
const temporaryDirectories: string[] = [];
function fixture(name = '@signalpost/server') {
  const directory = mkdtempSync(join(tmpdir(), 'signalpost-artifact-test-'));
  temporaryDirectories.push(directory);
  const root = join(directory, 'artifact');
  const links = join(root, 'node_modules/.pnpm/node_modules/@signalpost');
  mkdirSync(links, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name }));
  const source = join(directory, 'source');
  mkdirSync(source);
  const self = join(links, 'server');
  return { directory, root, source, self };
}
function run(root: string) {
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('portable deployment artifact', () => {
  it('localizes the known source self-reference and verifies all retained links', () => {
    const { root, source, self } = fixture();
    symlinkSync(source, self);
    symlinkSync('package.json', join(root, 'internal-link'));
    const result = run(root);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      status: 'verified',
      symlinks: 2,
      selfReferenceLocalized: true,
    });
    expect(readlinkSync(self)).toBe('../../../..');
    expect(run(root).status).toBe(0);
  });
  it('accepts an already portable artifact without a package self-link', () => {
    const { root } = fixture();
    expect(run(root).status).toBe(0);
  });
  it('refuses a different package instead of rewriting its links', () => {
    const { root, source, self } = fixture('@signalpost/other');
    symlinkSync(source, self);
    expect(run(root).status).toBe(1);
    expect(readlinkSync(self)).toBe(source);
  });
  it('fails on another escaping link without rewriting it', () => {
    const { root, source } = fixture();
    const escape = join(root, 'unknown-package');
    symlinkSync(source, escape);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Deployment symlink escapes the artifact: unknown-package');
    expect(readlinkSync(escape)).toBe(source);
  });
  it('fails on a dangling dependency instead of claiming a complete artifact', () => {
    const { root } = fixture();
    symlinkSync('missing', join(root, 'dangling'));
    expect(run(root).status).toBe(1);
  });
  it('does not replace a regular directory at the expected self-link path', () => {
    const { root, self } = fixture();
    mkdirSync(self);
    expect(run(root).status).toBe(1);
  });
});
