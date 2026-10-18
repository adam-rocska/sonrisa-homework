import { ComponentResource, all, getProject, getStack, output } from '@pulumi/pulumi';
import type { ComponentResourceOptions, Output } from '@pulumi/pulumi';
import { Container, Provider as DockerProvider, Volume } from '@pulumi/docker';
import { Provider as KubernetesProvider, apps, core } from '@pulumi/kubernetes';
import type { DeploymentSettings, RuntimeSecrets } from './config.js';
import { runtimeEnvironment, instanceLabel } from './model.js';
import type { ApplicationIntent, DockerTarget, KubernetesTarget } from './model.js';

interface RuntimeResources {
  readonly internalUrl: Output<string>;
  readonly workloadId: Output<string>;
  readonly dataResourceId: Output<string>;
}

function secretEnvironment(secrets: RuntimeSecrets): Output<Record<string, string>> {
  return all([
    secrets.authSecret,
    secrets.googleClientSecret,
    secrets.smtpConfiguration ?? output(undefined),
  ]).apply<Record<string, string>>(([authSecret, googleClientSecret, smtpConfiguration]) => ({
    BETTER_AUTH_SECRET: authSecret,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    ...(smtpConfiguration === undefined ? {} : { SIGNALPOST_MSMTP_CONFIG: smtpConfiguration }),
  }));
}

function dockerRuntime(
  name: string,
  parent: ComponentResource,
  application: ApplicationIntent,
  target: DockerTarget,
  secrets: RuntimeSecrets,
): RuntimeResources {
  const provider =
    parent.getProvider('docker:index:Container') ??
    new DockerProvider(`${name}-docker`, { host: target.socket }, { parent });
  const options = { parent, provider };
  const volume = new Volume(
    `${name}-data`,
    {},
    {
      ...options,
      protect: true,
      retainOnDelete: true,
    },
  );
  const environment = runtimeEnvironment(application);
  const container = new Container(
    `${name}-server`,
    {
      image: application.image,
      envs: secretEnvironment(secrets).apply((secretValues) =>
        Object.entries({ ...environment, ...secretValues }).map(
          ([key, value]) => `${key}=${value}`,
        ),
      ),
      ports: [{ internal: 3000, external: target.hostPort, ip: '127.0.0.1', protocol: 'tcp' }],
      volumes: [{ containerPath: '/var/lib/signalpost', volumeName: volume.name }],
      user: '1000:1000',
      restart: 'unless-stopped',
      readOnly: true,
      privileged: false,
      capabilities: { drops: ['ALL'] },
      securityOpts: ['no-new-privileges:true'],
      tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=1770' },
      init: true,
      stopSignal: 'SIGTERM',
      stopTimeout: 45,
      destroyGraceSeconds: 50,
      memory: 512,
      cpus: '1',
      logDriver: 'json-file',
      logOpts: { 'max-size': '10m', 'max-file': '3' },
      healthcheck: {
        tests: [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ],
        interval: '15s',
        timeout: '5s',
        startPeriod: '20s',
        retries: 3,
      },
    },
    { ...options, deleteBeforeReplace: true },
  );
  return {
    workloadId: container.id,
    dataResourceId: volume.id,
    internalUrl: output(`http://127.0.0.1:${target.hostPort}`),
  };
}

function kubernetesRuntime(
  name: string,
  parent: ComponentResource,
  application: ApplicationIntent,
  target: KubernetesTarget,
  secrets: RuntimeSecrets,
): RuntimeResources {
  const provider =
    parent.getProvider('kubernetes:apps/v1:Deployment') ??
    new KubernetesProvider(
      `${name}-kubernetes`,
      {
        context: target.context,
        namespace: target.namespace,
        enableServerSideApply: true,
      },
      { parent },
    );
  const options = { parent, provider };
  const labels = {
    'app.kubernetes.io/name': 'signalpost',
    'app.kubernetes.io/instance': instanceLabel(getProject(), getStack(), name),
  };
  const configuration = new core.v1.Secret(
    `${name}-secrets`,
    {
      metadata: { namespace: target.namespace },
      type: 'Opaque',
      immutable: true,
      stringData: secretEnvironment(secrets),
    },
    {
      ...options,
      additionalSecretOutputs: ['data', 'stringData'],
      replaceOnChanges: ['stringData'],
    },
  );
  const storage = new core.v1.PersistentVolumeClaim(
    `${name}-data`,
    {
      metadata: { namespace: target.namespace },
      spec: {
        accessModes: ['ReadWriteOnce'],
        ...(target.storageClass === undefined ? {} : { storageClassName: target.storageClass }),
        resources: { requests: { storage: target.storageSize } },
      },
    },
    { ...options, protect: true, retainOnDelete: true },
  );
  const environment = Object.entries(runtimeEnvironment(application)).map(([key, value]) => ({
    name: key,
    value,
  }));
  const secretKeys = ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_SECRET'];
  if (secrets.smtpConfiguration !== undefined) secretKeys.push('SIGNALPOST_MSMTP_CONFIG');
  const deployment = new apps.v1.Deployment(
    `${name}-server`,
    {
      metadata: { namespace: target.namespace, labels },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        selector: { matchLabels: labels },
        template: {
          metadata: { labels },
          spec: {
            automountServiceAccountToken: false,
            terminationGracePeriodSeconds: 45,
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1000,
              runAsGroup: 1000,
              fsGroup: 1000,
              fsGroupChangePolicy: 'OnRootMismatch',
              seccompProfile: { type: 'RuntimeDefault' },
            },
            containers: [
              {
                name: 'server',
                image: application.image,
                imagePullPolicy: 'IfNotPresent',
                ports: [{ name: 'http', containerPort: 3000 }],
                env: [
                  ...environment,
                  ...secretKeys.map((key) => ({
                    name: key,
                    valueFrom: { secretKeyRef: { name: configuration.metadata.name, key } },
                  })),
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  capabilities: { drop: ['ALL'] },
                },
                readinessProbe: {
                  httpGet: { path: '/healthz', port: 'http' },
                  periodSeconds: 5,
                  timeoutSeconds: 2,
                },
                livenessProbe: {
                  httpGet: { path: '/healthz', port: 'http' },
                  periodSeconds: 15,
                  timeoutSeconds: 2,
                },
                startupProbe: {
                  httpGet: { path: '/healthz', port: 'http' },
                  periodSeconds: 2,
                  failureThreshold: 30,
                },
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '1', memory: '512Mi' },
                },
                volumeMounts: [
                  { name: 'data', mountPath: '/var/lib/signalpost' },
                  { name: 'temporary', mountPath: '/tmp' },
                ],
              },
            ],
            volumes: [
              { name: 'data', persistentVolumeClaim: { claimName: storage.metadata.name } },
              { name: 'temporary', emptyDir: { medium: 'Memory', sizeLimit: '16Mi' } },
            ],
          },
        },
      },
    },
    options,
  );
  const service = new core.v1.Service(
    `${name}-http`,
    {
      metadata: { namespace: target.namespace, labels },
      spec: {
        type: 'ClusterIP',
        selector: labels,
        ports: [{ name: 'http', port: 3000, targetPort: 'http' }],
      },
    },
    options,
  );
  return {
    workloadId: deployment.id,
    dataResourceId: storage.id,
    internalUrl: service.metadata.name.apply(
      (serviceName) => `http://${serviceName}.${target.namespace}.svc.cluster.local:3000`,
    ),
  };
}

export class SignalpostDeployment extends ComponentResource {
  readonly internalUrl: Output<string>;
  readonly publicUrl: Output<string>;
  readonly oauthCallbackUrl: Output<string>;
  readonly dataResourceId: Output<string>;
  readonly workloadId: Output<string>;

  constructor(name: string, settings: DeploymentSettings, options?: ComponentResourceOptions) {
    super('signalpost:runtime:Deployment', name, {}, options);
    const { application, target } = settings.intent;
    const resources =
      target.kind === 'docker'
        ? dockerRuntime(name, this, application, target, settings.secrets)
        : kubernetesRuntime(name, this, application, target, settings.secrets);
    this.internalUrl = resources.internalUrl;
    this.publicUrl = output(application.publicUrl);
    this.oauthCallbackUrl = output(`${application.publicUrl}/api/auth/callback/google`);
    this.dataResourceId = resources.dataResourceId;
    this.workloadId = resources.workloadId;
    this.registerOutputs({
      internalUrl: this.internalUrl,
      publicUrl: this.publicUrl,
      oauthCallbackUrl: this.oauthCallbackUrl,
      dataResourceId: this.dataResourceId,
      workloadId: this.workloadId,
    });
  }
}
