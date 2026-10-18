import { describe, expect, it } from 'vitest';
import { instanceLabel, parseDeployment, runtimeEnvironment } from '../src/model.js';
import type { RawSettings } from '../src/model.js';

const local: RawSettings = {
  target: 'docker',
  image: 'signalpost:test',
  publicUrl: 'http://localhost:3300',
  googleClientId: 'fixture.apps.googleusercontent.com',
  extensionIds: ['a'.repeat(32)],
};

describe('deployment boundary', () => {
  it('isolates service selectors across projects, stacks and component instances', () => {
    const identities = [
      ['p', 's', 'a'],
      ['p', 'other', 'a'],
      ['other', 's', 'a'],
      ['p', 's', 'other'],
    ] as const;
    const labels = identities.map(([project, stack, component]) =>
      instanceLabel(project, stack, component),
    );
    expect(new Set(labels).size).toBe(identities.length);
    expect(instanceLabel('p', 's', 'a')).toBe(instanceLabel('p', 's', 'a'));
    expect(labels.every((label) => /^[a-z0-9-]{1,63}$/u.test(label))).toBe(true);
  });
  it('translates local intent to the server contract without transport/provider models', () => {
    const intent = parseDeployment({
      ...local,
      adminEmails: ['ADMIN@example.com'],
      mailFrom: 'alert@example.com',
    });
    expect(intent.target).toEqual({
      kind: 'docker',
      socket: 'unix:///var/run/docker.sock',
      hostPort: 3300,
    });
    expect(runtimeEnvironment(intent.application)).toMatchObject({
      HOST: '0.0.0.0',
      NODE_ENV: 'development',
      PORT: '3000',
      BETTER_AUTH_URL: 'http://localhost:3300',
      DATA_DIRECTORY: '/var/lib/signalpost',
      ADMIN_EMAILS: 'admin@example.com',
      MAIL_FROM: 'alert@example.com',
      SENDMAIL_PATH: '/usr/local/libexec/signalpost/sendmail.sh',
    });
    expect(runtimeEnvironment(intent.application)).not.toHaveProperty('BETTER_AUTH_SECRET');
  });

  it('uses production mode and an explicitly selected existing Kubernetes namespace', () => {
    const intent = parseDeployment({
      ...local,
      target: 'kubernetes',
      publicUrl: 'https://alerts.example.com/',
      kubeContext: 'existing',
      namespace: 'alerts',
      storageClass: 'local-storage',
    });
    expect(intent.target).toEqual({
      kind: 'kubernetes',
      context: 'existing',
      namespace: 'alerts',
      storageSize: '1Gi',
      storageClass: 'local-storage',
    });
    expect(runtimeEnvironment(intent.application)['NODE_ENV']).toBe('production');
  });

  it.each([
    { publicUrl: 'http://alerts.example.com' },
    { publicUrl: 'https://user:password@example.com' },
    { publicUrl: 'https://example.com/path' },
    { publicUrl: 'https://example.com?query=yes' },
    { publicUrl: 'https://example.com#hash' },
    { publicUrl: 'http://localhost:3000' },
    {
      target: 'kubernetes',
      publicUrl: 'http://localhost:3300',
      kubeContext: 'test',
      namespace: 'test',
    },
    { target: 'kubernetes', publicUrl: 'https://example.com', namespace: 'test' },
    { target: 'kubernetes', publicUrl: 'https://example.com', kubeContext: 'test' },
    { target: 'kubernetes', publicUrl: 'https://example.com', kubeContext: '', namespace: 'test' },
    {
      target: 'kubernetes',
      publicUrl: 'https://example.com',
      kubeContext: 'test',
      namespace: 'INVALID',
    },
    {
      target: 'kubernetes',
      publicUrl: 'https://example.com',
      kubeContext: 'test',
      namespace: 'test',
      storageSize: '0Gi',
    },
    { dockerSocket: 'tcp://unintended-host:2375' },
    { hostPort: 80 },
    { hostPort: 65536 },
    { image: 'image\ninjected' },
    { extensionIds: [] },
    { extensionIds: ['not-an-id'] },
    { pollIntervalMs: 9999 },
    { pollIntervalMs: 10000.5 },
    { pollIntervalMs: 3600001 },
    { adminEmails: ['admin@example.com\ninjected'] },
    { mailFrom: 'Sender <sender@example.com>' },
    { target: 'unimplemented-cloud' },
  ])('rejects unsafe or ambiguous deployment settings: %j', (invalid) => {
    expect(() => parseDeployment({ ...local, ...invalid })).toThrow();
  });
});
