import { readDeploymentSettings } from './config.js';
import { SignalpostDeployment } from './deployment.js';

const deployment = new SignalpostDeployment('signalpost', readDeploymentSettings());
export const publicUrl = deployment.publicUrl;
export const oauthCallbackUrl = deployment.oauthCallbackUrl;
export const dataResourceId = deployment.dataResourceId;
export const workloadId = deployment.workloadId;

export const internalUrl = deployment.internalUrl;
