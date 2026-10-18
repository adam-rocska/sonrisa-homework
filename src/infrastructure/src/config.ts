import { Config } from '@pulumi/pulumi';
import type { Output } from '@pulumi/pulumi';
import { parseDeployment } from './model.js';
import type { DeploymentIntent, RawSettings } from './model.js';

export interface RuntimeSecrets {
  readonly authSecret: Output<string>;
  readonly googleClientSecret: Output<string>;
  readonly smtpConfiguration: Output<string> | undefined;
}

export interface DeploymentSettings {
  readonly intent: DeploymentIntent;
  readonly secrets: RuntimeSecrets;
}

export function readDeploymentSettings(config: Config = new Config()): DeploymentSettings {
  const optionalSettings = {
    adminEmails: config.getObject<readonly string[]>('adminEmails'),
    mailFrom: config.get('mailFrom'),
    pollIntervalMs: config.getNumber('pollIntervalMs'),
    dockerSocket: config.get('dockerSocket'),
    hostPort: config.getNumber('hostPort'),
    kubeContext: config.get('kubeContext'),
    namespace: config.get('namespace'),
    storageClass: config.get('storageClass'),
    storageSize: config.get('storageSize'),
  };
  const raw: RawSettings = {
    target: config.require('target'),
    image: config.require('image'),
    publicUrl: config.require('publicUrl'),
    googleClientId: config.require('googleClientId'),
    extensionIds: config.requireObject<readonly string[]>('extensionIds'),
    ...Object.fromEntries(
      Object.entries(optionalSettings).filter(([, value]) => value !== undefined),
    ),
  };
  return {
    intent: parseDeployment(raw),
    secrets: {
      authSecret: config.requireSecret('authSecret').apply((value) => {
        if (value.length < 32) throw new Error('authSecret must have at least 32 characters.');
        return value;
      }),
      googleClientSecret: config.requireSecret('googleClientSecret').apply((value) => {
        if (value.trim() === '') throw new Error('googleClientSecret must not be empty.');
        return value;
      }),
      smtpConfiguration: config.getSecret('smtpConfiguration'),
    },
  };
}
