import { createHash } from 'node:crypto';

/** Deployment intent is independent of Pulumi resource and server runtime models. */
export interface ApplicationIntent {
  readonly image: string;
  readonly publicUrl: string;
  readonly googleClientId: string;
  readonly extensionIds: readonly string[];
  readonly adminEmails: readonly string[];
  readonly mailFrom: string | undefined;
  readonly pollIntervalMs: number;
}

export interface DockerTarget {
  readonly kind: 'docker';
  readonly socket: string;
  readonly hostPort: number;
}

export interface KubernetesTarget {
  readonly kind: 'kubernetes';
  readonly context: string;
  readonly namespace: string;
  readonly storageClass: string | undefined;
  readonly storageSize: string;
}

export interface DeploymentIntent {
  readonly application: ApplicationIntent;
  readonly target: DockerTarget | KubernetesTarget;
}

export interface RawSettings {
  readonly target: string;
  readonly image: string;
  readonly publicUrl: string;
  readonly googleClientId: string;
  readonly extensionIds: readonly string[];
  readonly adminEmails?: readonly string[];
  readonly mailFrom?: string;
  readonly pollIntervalMs?: number;
  readonly dockerSocket?: string;
  readonly hostPort?: number;
  readonly kubeContext?: string;
  readonly namespace?: string;
  readonly storageClass?: string;
  readonly storageSize?: string;
}

function text(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized === '' || /[\r\n\0]/u.test(normalized)) {
    throw new Error(`${name} must be nonempty and contain no control characters.`);
  }
  return normalized;
}

function integer(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function dnsLabel(value: string, name: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value)) {
    throw new Error(`${name} must be a Kubernetes DNS label.`);
  }
  return value;
}

function email(value: string, name: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(normalized)) {
    throw new Error(`${name} must contain plain email addresses.`);
  }
  return normalized;
}

export function parseDeployment(settings: RawSettings): DeploymentIntent {
  if (settings.target !== 'docker' && settings.target !== 'kubernetes') {
    throw new Error('target must be docker or kubernetes.');
  }
  const publicUrl = new URL(settings.publicUrl);
  if (
    publicUrl.username !== '' ||
    publicUrl.password !== '' ||
    publicUrl.pathname !== '/' ||
    publicUrl.search !== '' ||
    publicUrl.hash !== ''
  ) {
    throw new Error('publicUrl must be an origin without credentials, path, query or fragment.');
  }
  const localDevelopment =
    settings.target === 'docker' &&
    publicUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(publicUrl.hostname);
  if (publicUrl.protocol !== 'https:' && !localDevelopment) {
    throw new Error('publicUrl requires HTTPS, except localhost HTTP on Docker.');
  }
  const image = text(settings.image, 'image');
  if (/\s/u.test(image))
    throw new Error('image must be an OCI image reference without whitespace.');
  const extensionIds = [...new Set(settings.extensionIds)];
  if (extensionIds.length === 0 || extensionIds.some((id) => !/^[a-p]{32}$/u.test(id))) {
    throw new Error('extensionIds must include exact 32-letter Chrome extension IDs.');
  }
  const application: ApplicationIntent = {
    image,
    publicUrl: publicUrl.origin,
    googleClientId: text(settings.googleClientId, 'googleClientId'),
    extensionIds,
    adminEmails: [
      ...new Set((settings.adminEmails ?? []).map((entry) => email(entry, 'adminEmails'))),
    ],
    mailFrom: settings.mailFrom === undefined ? undefined : email(settings.mailFrom, 'mailFrom'),
    pollIntervalMs: integer(settings.pollIntervalMs ?? 60_000, 10_000, 3_600_000, 'pollIntervalMs'),
  };
  if (settings.target === 'docker') {
    const socket = text(settings.dockerSocket ?? 'unix:///var/run/docker.sock', 'dockerSocket');
    if (!/^unix:\/\/\/(?!.*\.\.)[^\r\n\0]+$/u.test(socket)) {
      throw new Error(
        'dockerSocket must identify a local Unix socket; remote daemons are not supported.',
      );
    }
    const hostPort = integer(settings.hostPort ?? 3300, 1024, 65535, 'hostPort');
    if (localDevelopment && Number(publicUrl.port || '80') !== hostPort) {
      throw new Error('Local HTTP publicUrl port must equal hostPort.');
    }
    return { application, target: { kind: 'docker', socket, hostPort } };
  }
  if (settings.kubeContext === undefined || settings.namespace === undefined) {
    throw new Error(
      'kubeContext and an existing namespace are required; no ambient cluster selection.',
    );
  }
  const storageSize = settings.storageSize ?? '1Gi';
  if (!/^[1-9]\d*(?:Mi|Gi|Ti)$/u.test(storageSize)) {
    throw new Error('storageSize must be a positive Mi, Gi or Ti quantity.');
  }
  return {
    application,
    target: {
      kind: 'kubernetes',
      context: text(settings.kubeContext, 'kubeContext'),
      namespace: dnsLabel(settings.namespace, 'namespace'),
      storageClass:
        settings.storageClass === undefined
          ? undefined
          : text(settings.storageClass, 'storageClass'),
      storageSize,
    },
  };
}

/** The adapter to the existing server's public environment contract. */
export function runtimeEnvironment(intent: ApplicationIntent): Readonly<Record<string, string>> {
  return {
    NODE_ENV: intent.publicUrl.startsWith('http:') ? 'development' : 'production',
    HOST: '0.0.0.0',
    PORT: '3000',
    BETTER_AUTH_URL: intent.publicUrl,
    GOOGLE_CLIENT_ID: intent.googleClientId,
    EXTENSION_IDS: intent.extensionIds.join(','),
    ADMIN_EMAILS: intent.adminEmails.join(','),
    DATA_DIRECTORY: '/var/lib/signalpost',
    SENDMAIL_PATH: '/usr/local/libexec/signalpost/sendmail.sh',
    POLL_INTERVAL_MS: String(intent.pollIntervalMs),
    ...(intent.mailFrom === undefined ? {} : { MAIL_FROM: intent.mailFrom }),
  };
}

/** Distinguishes stacks sharing a namespace while keeping a stable DNS-safe label. */
export function instanceLabel(project: string, stack: string, component: string): string {
  return (
    'signalpost-' +
    createHash('sha256')
      .update(JSON.stringify([project, stack, component]))
      .digest('hex')
      .slice(0, 20)
  );
}
