/** Run only against an isolated local Pulumi stack. All credentials below are fixtures. */
import { isAbsolute } from 'node:path';
import { secret } from '@pulumi/pulumi';
import { Provider } from '@pulumi/kubernetes';
import { SignalpostDeployment } from '../../src/deployment.js';
import { parseDeployment } from '../../src/model.js';

const directory = process.env['SIGNALPOST_RENDER_DIRECTORY'];
if (directory === undefined || !isAbsolute(directory)) {
  throw new Error('SIGNALPOST_RENDER_DIRECTORY must be an absolute isolated test directory.');
}
const provider = new Provider('offline-yaml', { renderYamlToDirectory: directory });
const deployment = new SignalpostDeployment(
  'offline-signalpost',
  {
    intent: parseDeployment({
      target: 'kubernetes',
      image: 'example.invalid/signalpost:offline-test',
      publicUrl: 'https://signalpost.example.invalid',
      googleClientId: 'fixture.apps.googleusercontent.com',
      extensionIds: ['a'.repeat(32)],
      kubeContext: 'unused-offline-fixture',
      namespace: 'fixture-namespace',
    }),
    secrets: {
      authSecret: secret('fixture-auth-secret-at-least-32-characters'),
      googleClientSecret: secret('fixture-google-secret'),
      smtpConfiguration: secret('fixture-smtp-configuration'),
    },
  },
  { providers: { kubernetes: provider } },
);
export const publicUrl = deployment.publicUrl;
export const oauthCallbackUrl = deployment.oauthCallbackUrl;
export const dataResourceId = deployment.dataResourceId;
export const workloadId = deployment.workloadId;

export const internalUrl = deployment.internalUrl;
