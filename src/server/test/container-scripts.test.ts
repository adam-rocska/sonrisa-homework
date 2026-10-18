import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scripts = fileURLToPath(new URL('../sbin/', import.meta.url));
const temporaryDirectories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'signalpost-container-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
function configure(directory: string, config?: string) {
  return spawnSync(
    '/bin/sh',
    ['-c', '. "$1"; configure_msmtp "$2"', 'test', join(scripts, 'msmtp-config.sh'), directory],
    {
      env: {
        PATH: '/usr/bin:/bin',
        ...(config === undefined ? {} : { SIGNALPOST_MSMTP_CONFIG: config }),
      },
      encoding: 'utf8',
    },
  );
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('container mail configuration', () => {
  it('writes private credentials literally without shell expansion or output', () => {
    const directory = join(temporaryDirectory(), 'private');
    const config = 'account default\nhost smtp.example.test\npassword $(echo unsafe) `echo unsafe`';
    const result = configure(directory, config);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(readFileSync(join(directory, 'msmtprc'), 'utf8')).toBe(`${config}\n`);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, 'msmtprc')).mode & 0o777).toBe(0o600);
  });
  it('replaces an earlier configuration and restrictive modes survive permissive files', () => {
    const directory = temporaryDirectory();
    const file = join(directory, 'msmtprc');
    writeFileSync(file, 'stale secret', { mode: 0o644 });
    chmodSync(directory, 0o755);
    expect(configure(directory, 'account default\nhost new.example.test').status).toBe(0);
    expect(readFileSync(file, 'utf8')).not.toContain('stale');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
  });
  it.each([undefined, ''])('removes stale credentials when configuration is %j', (config) => {
    const directory = temporaryDirectory();
    const file = join(directory, 'msmtprc');
    writeFileSync(file, 'stale secret');
    expect(configure(directory, config).status).toBe(0);
    expect(existsSync(file)).toBe(false);
  });
  it('does not overwrite a file reached through a previous config symlink', () => {
    const directory = temporaryDirectory();
    const unrelated = join(directory, 'unrelated');
    writeFileSync(unrelated, 'keep');
    symlinkSync(unrelated, join(directory, 'msmtprc'));
    expect(configure(directory, 'replacement').status).toBe(0);
    expect(readFileSync(unrelated, 'utf8')).toBe('keep');
    expect(readFileSync(join(directory, 'msmtprc'), 'utf8')).toBe('replacement\n');
  });
  it('rejects a symlinked private directory without changing its target', () => {
    const directory = temporaryDirectory();
    const target = join(directory, 'target');
    const link = join(directory, 'link');
    mkdirSync(target);
    writeFileSync(join(target, 'msmtprc'), 'keep');
    symlinkSync(target, link);
    expect(configure(link, 'replacement').status).toBe(78);
    expect(readFileSync(join(target, 'msmtprc'), 'utf8')).toBe('keep');
  });
});

describe('container entrypoint', () => {
  function entrypointWithHelper(helper: string): string {
    const directory = temporaryDirectory();
    copyFileSync(join(scripts, 'container-entrypoint.sh'), join(directory, 'entrypoint.sh'));
    writeFileSync(join(directory, 'msmtp-config.sh'), helper);
    return join(directory, 'entrypoint.sh');
  }
  it('configures mail before exec, removes the credential environment, and preserves PID', () => {
    const directory = temporaryDirectory();
    const received = join(directory, 'received');
    const entrypoint = entrypointWithHelper(
      'configure_msmtp() { printf "%s\\n%s" "$1" "$SIGNALPOST_MSMTP_CONFIG" > "$TEST_RECEIVED"; }\n',
    );
    const result = spawnSync(
      '/bin/sh',
      [
        entrypoint,
        process.execPath,
        '-e',
        'process.stdout.write(JSON.stringify({pid:process.pid,secret:process.env.SIGNALPOST_MSMTP_CONFIG??null,args:process.argv.slice(1)}))',
        '--',
        'argument with spaces',
        '$(literal)',
      ],
      {
        env: {
          PATH: '/usr/bin:/bin',
          SIGNALPOST_MSMTP_CONFIG: 'test credential',
          TEST_RECEIVED: received,
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      pid: result.pid,
      secret: null,
      args: ['argument with spaces', '$(literal)'],
    });
    expect(readFileSync(received, 'utf8')).toBe('/tmp/signalpost-mail\ntest credential');
  });
  it('does not start the application if private mail configuration fails', () => {
    const entrypoint = entrypointWithHelper('configure_msmtp() { return 78; }\n');
    const result = spawnSync('/bin/sh', [entrypoint, '/bin/echo', 'should not start'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(78);
    expect(result.stdout).toBe('');
  });
});

describe('sendmail-compatible wrapper', () => {
  it.each([0, 75])('preserves message, argument boundaries and transport exit code %i', (exit) => {
    const directory = temporaryDirectory();
    const argumentsFile = join(directory, 'arguments');
    const messageFile = join(directory, 'message');
    writeFileSync(
      join(directory, 'msmtp'),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_ARGUMENTS"\ncat > "$TEST_MESSAGE"\nexit "$TEST_EXIT"\n',
      { mode: 0o755 },
    );
    const message = 'From: sender@example.test\r\nTo: user@example.test\r\n\r\nárvíztűrő\r\n';
    const result = spawnSync(
      '/bin/sh',
      [join(scripts, 'sendmail.sh'), '-i', '-f', 'sender@example.test', '--', 'user@example.test'],
      {
        env: {
          PATH: `${directory}:/usr/bin:/bin`,
          TEST_ARGUMENTS: argumentsFile,
          TEST_MESSAGE: messageFile,
          TEST_EXIT: String(exit),
        },
        input: message,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(exit);
    expect(result.stdout).toBe('');
    expect(readFileSync(argumentsFile, 'utf8').split('\n')).toEqual([
      '--file=/tmp/signalpost-mail/msmtprc',
      '-i',
      '-f',
      'sender@example.test',
      '--',
      'user@example.test',
      '',
    ]);
    expect(readFileSync(messageFile, 'utf8')).toBe(message);
  });
  it('fails instead of accepting a message when the transport executable is missing', () => {
    const result = spawnSync('/bin/sh', [join(scripts, 'sendmail.sh'), '--', 'user@example.test'], {
      env: { PATH: temporaryDirectory() },
      encoding: 'utf8',
    });
    expect(result.status).toBe(127);
  });
});
