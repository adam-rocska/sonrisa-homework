import { beforeAll, describe, expect, it } from 'vitest';
import { all, isSecret, output, runtime, secret } from '@pulumi/pulumi';
import type { Output, ResourceOptions } from '@pulumi/pulumi';
import { SignalpostDeployment } from '../src/deployment.js';
import { parseDeployment } from '../src/model.js';

interface RegisteredResource {
  readonly type: string;
  readonly name: string;
  readonly inputs: Record<string, unknown>;
  readonly provider: string | undefined;
}
const resources: RegisteredResource[] = [];
const policies = new Map<string, ResourceOptions>();
const resolveOutput = <T>(value: Output<T>): Promise<T> =>
  new Promise((resolve) => {
    value.apply(resolve);
  });

beforeAll(async () => {
  await runtime.setMocks(
    {
      newResource: (args) => {
        const inputs = args.inputs as Record<string, unknown>;
        resources.push({ type: args.type, name: args.name, inputs, provider: args.provider });
        const metadata = inputs['metadata'] as Record<string, unknown> | undefined;
        return {
          id: `${args.name}-id`,
          state: {
            ...inputs,
            name: args.name,
            ...(metadata === undefined ? {} : { metadata: { ...metadata, name: args.name } }),
          },
        };
      },
      call: (args) => args.inputs as Record<string, unknown>,
    },
    'signalpost',
    'unit',
    false,
  );
});

function makeDeployment(target: 'docker' | 'kubernetes'): SignalpostDeployment {
  return new SignalpostDeployment(
    `test-${target}`,
    {
      intent: parseDeployment({
        target,
        image: 'signalpost:test',
        publicUrl: target === 'docker' ? 'http://localhost:3300' : 'https://alerts.example.com',
        googleClientId: 'fixture.apps.googleusercontent.com',
        extensionIds: ['a'.repeat(32)],
        kubeContext: 'explicit-test-context',
        namespace: 'existing-test-namespace',
      }),
      secrets: {
        authSecret: secret('fixture-only-auth-secret-at-least-32-characters'),
        googleClientSecret: secret('fixture-only-google-secret'),
        smtpConfiguration: secret('fixture-only-smtp-configuration'),
      },
    },
    {
      transformations: [
        (args) => {
          policies.set(args.name, args.opts);
          return undefined;
        },
      ],
    },
  );
}

function getResource(type: string): RegisteredResource {
  const resource = resources.find((entry) => entry.type === type);
  if (resource === undefined) throw new Error(`Missing resource: ${type}`);
  return resource;
}

describe('actual Pulumi resource graph', () => {
  it('isolates local Docker and retains data across workload replacement', async () => {
    const deployment = makeDeployment('docker');
    await resolveOutput(all([deployment.workloadId, deployment.dataResourceId]));
    const provider = getResource('pulumi:providers:docker');
    expect(provider.inputs['host']).toBe('unix:///var/run/docker.sock');
    const container = getResource('docker:index/container:Container');
    expect(container.provider).toContain('test-docker-docker');
    expect(container.inputs).toMatchObject({
      ports: [{ internal: 3000, external: 3300, ip: '127.0.0.1', protocol: 'tcp' }],
      user: '1000:1000',
      restart: 'unless-stopped',
      readOnly: true,
      privileged: false,
      capabilities: { drops: ['ALL'] },
      securityOpts: ['no-new-privileges:true'],
      stopTimeout: 45,
      volumes: [{ containerPath: '/var/lib/signalpost', volumeName: 'test-docker-data' }],
    });
    expect(policies.get('test-docker-server')).toMatchObject({ deleteBeforeReplace: true });
    expect(policies.get('test-docker-data')).toMatchObject({ protect: true, retainOnDelete: true });
    const volume = getResource('docker:index/volume:Volume');
    expect(volume.provider).toContain('test-docker-docker');
    // Pulumi's secret envelope proves taint propagation through the environment mapping.
    expect(container.inputs['envs']).toMatchObject({
      '4dabf18193072939515e22adb298388d': '1b47061264138c4ac30d75fd1eb44270',
    });
    expect(await isSecret(deployment.publicUrl)).toBe(false);
    expect(await resolveOutput(deployment.internalUrl)).toBe('http://127.0.0.1:3300');
    expect(await resolveOutput(deployment.oauthCallbackUrl)).toBe(
      'http://localhost:3300/api/auth/callback/google',
    );
  });

  it('keeps Kubernetes single-writer, private, non-root and explicit', async () => {
    const deployment = makeDeployment('kubernetes');
    await resolveOutput(all([deployment.workloadId, deployment.dataResourceId]));
    const provider = getResource('pulumi:providers:kubernetes');
    expect(provider.inputs).toMatchObject({
      context: 'explicit-test-context',
      namespace: 'existing-test-namespace',
    });
    const workload = getResource('kubernetes:apps/v1:Deployment');
    expect(workload.provider).toContain('test-kubernetes-kubernetes');
    expect(workload.inputs).toMatchObject({
      metadata: { namespace: 'existing-test-namespace' },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        template: {
          spec: {
            automountServiceAccountToken: false,
            terminationGracePeriodSeconds: 45,
            securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
            containers: [
              {
                securityContext: {
                  readOnlyRootFilesystem: true,
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ['ALL'] },
                },
                readinessProbe: { httpGet: { path: '/healthz', port: 'http' } },
                volumeMounts: [
                  { name: 'data', mountPath: '/var/lib/signalpost' },
                  { name: 'temporary', mountPath: '/tmp' },
                ],
              },
            ],
          },
        },
      },
    });
    expect(policies.get('test-kubernetes-data')).toMatchObject({
      protect: true,
      retainOnDelete: true,
    });
    const pvc = getResource('kubernetes:core/v1:PersistentVolumeClaim');
    expect(pvc.inputs['spec']).toMatchObject({
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '1Gi' } },
    });
    const service = getResource('kubernetes:core/v1:Service');
    expect(service.inputs['spec']).toMatchObject({
      type: 'ClusterIP',
      ports: [{ port: 3000, targetPort: 'http' }],
    });
    const configuration = getResource('kubernetes:core/v1:Secret');
    expect(configuration.inputs['immutable']).toBe(true);
    expect(policies.get('test-kubernetes-secrets')).toMatchObject({
      replaceOnChanges: ['stringData'],
      additionalSecretOutputs: expect.arrayContaining(['data', 'stringData']),
    });
    expect(configuration.inputs['stringData']).toMatchObject({
      '4dabf18193072939515e22adb298388d': '1b47061264138c4ac30d75fd1eb44270',
    });
    expect(resources.some((entry) => /Namespace|LoadBalancer|Ingress/u.test(entry.type))).toBe(
      false,
    );
    expect(await resolveOutput(deployment.publicUrl)).toBe('https://alerts.example.com');
    expect(await resolveOutput(deployment.internalUrl)).toBe(
      'http://test-kubernetes-http.existing-test-namespace.svc.cluster.local:3000',
    );
    expect(await isSecret(deployment.internalUrl)).toBe(false);
    expect(await isSecret(output(deployment.dataResourceId))).toBe(false);
  });
});
