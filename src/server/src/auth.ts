import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { bearer } from 'better-auth/plugins';
import type { ServerConfig } from './config.js';
import type { AuthBoundary } from './identity.js';

export async function createGoogleAuth(config: ServerConfig): Promise<AuthBoundary> {
  if (
    config.authSecret === undefined ||
    config.googleClientId === undefined ||
    config.googleClientSecret === undefined ||
    config.extensionIds.length === 0
  ) {
    return {
      configured: false,
      handler: async () =>
        Response.json(
          {
            error: 'Authentication is not configured.',
            requirements: config.authConfigurationIssues,
          },
          { status: 503 },
        ),
      getSession: async () => null,
      close: () => undefined,
    };
  }
  mkdirSync(config.dataDirectory, { recursive: true, mode: 0o700 });
  const database = new Database(join(config.dataDirectory, 'auth.sqlite'));
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  const options = {
    appName: 'Signalpost',
    baseURL: config.baseUrl,
    secret: config.authSecret,
    database,
    trustedOrigins: [...config.trustedOrigins],
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        scope: ['openid', 'email', 'profile'],
        prompt: 'select_account',
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { encryptOAuthTokens: true },
    plugins: [bearer()],
  } satisfies BetterAuthOptions;
  try {
    // Migrate before constructing the runtime so its startup schema check
    // cannot race a newly created database's migration.
    const migrations = await getMigrations(options);
    await migrations.runMigrations();
  } catch (error) {
    database.close();
    throw error;
  }
  const auth = betterAuth(options);
  return {
    configured: true,
    handler: async (request) => auth.handler(request),
    getSession: async (headers) => {
      const session = await auth.api.getSession({ headers });
      return session === null
        ? null
        : {
            session: { token: session.session.token, expiresAt: session.session.expiresAt },
            user: {
              id: session.user.id,
              email: session.user.email,
              emailVerified: session.user.emailVerified,
              name: session.user.name,
            },
          };
    },
    close: () => database.close(),
  };
}
