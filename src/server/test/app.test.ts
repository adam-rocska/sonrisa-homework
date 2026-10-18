import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { HandoffBroker } from '../src/handoff.js';
import type { AuthBoundary } from '../src/identity.js';
import { fakeStore, principal, session } from './fixtures.js';

function fakeAuth(configured = false): AuthBoundary {
  return {
    configured,
    handler: vi.fn(async () => new Response('unused')),
    getSession: vi.fn(async () => (configured ? session : null)),
    close: vi.fn(),
  };
}
describe('HTTP authentication boundary', () => {
  it('exposes honest health and actionable missing configuration without an auth bypass', async () => {
    const app = createApp({ config: readConfig({}), auth: fakeAuth(), store: fakeStore() });
    expect(await (await app.request('/healthz')).json()).toEqual({
      status: 'ok',
      authentication: 'unconfigured',
    });
    const signIn = await app.request('/auth/start');
    expect(signIn.status).toBe(503);
    expect(await signIn.text()).toContain('GOOGLE_CLIENT_ID');
    const data = await app.request('/trpc/catalog.get');
    expect(data.status).toBe(401);
  });
  it('rejects hostile origins before a product mutation or token exchange', async () => {
    const app = createApp({ config: readConfig({}), auth: fakeAuth(true), store: fakeStore() });
    expect(
      (
        await app.request('/trpc/catalog.replace', {
          method: 'POST',
          headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/auth/exchange', {
          method: 'POST',
          headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
  });
  it('requires the original browser flow cookie before completing sign-in', async () => {
    const app = createApp({ config: readConfig({}), auth: fakeAuth(true), store: fakeStore() });
    const result = await app.request('/auth/complete?flow=attacker');
    expect(result.status).toBe(400);
  });
  it('rejects oversized request bodies before any store mutation', async () => {
    const store = fakeStore();
    const app = createApp({ config: readConfig({}), auth: fakeAuth(true), store });
    const result = await app.request('/trpc/catalog.replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(1_048_577),
    });
    expect(result.status).toBe(413);
    expect(result.headers.get('Connection')).toBe('close');
    expect(store.replaceCatalog).not.toHaveBeenCalled();
  });
  it('does not accept malformed or missing PKCE exchange payloads', async () => {
    const app = createApp({ config: readConfig({}), auth: fakeAuth(true), store: fakeStore() });
    expect((await app.request('/auth/exchange', { method: 'POST', body: 'not json' })).status).toBe(
      400,
    );
    expect(
      (
        await app.request('/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'code',
            codeVerifier: 'short',
            redirectUri: 'https://attacker.example',
          }),
        })
      ).status,
    ).toBe(400);
  });
  it('bounds tRPC batch work and rejects oversize batches before touching the store', async () => {
    const store = fakeStore();
    const app = createApp({ config: readConfig({}), auth: fakeAuth(true), store });
    const tooMany = Array.from({ length: 21 }, () => 'catalog.get').join(',');
    const rejected = await app.request(`/trpc/${tooMany}?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain('Batch call exceeds maximum size');
    expect(store.getCatalog).not.toHaveBeenCalled();
    const allowed = Array.from({ length: 20 }, () => 'me').join(',');
    const response = await app.request(`/trpc/${allowed}?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(20);
  });
  it('exchanges only a verifier-bound one-use code and revalidates the session', async () => {
    const config = readConfig({ EXTENSION_IDS: 'a'.repeat(32) });
    const auth = fakeAuth(true);
    const broker = new HandoffBroker(config.extensionRedirects);
    const verifier = 'v'.repeat(64);
    const redirectUri = config.extensionRedirects[0] ?? '';
    const flow = broker.begin({
      redirectUri,
      state: 's'.repeat(43),
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    });
    const callback = new URL(
      broker.complete(flow, {
        token: session.session.token,
        expiresAt: session.session.expiresAt.toISOString(),
        user: principal,
      }),
    );
    const app = createApp({ config, auth, store: fakeStore(), handoffs: broker });
    const response = await app.request('/auth/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `chrome-extension://${'a'.repeat(32)}`,
      },
      body: JSON.stringify({
        code: callback.searchParams.get('code'),
        codeVerifier: verifier,
        redirectUri,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ token: session.session.token, user: principal });
    const header = vi.mocked(auth.getSession).mock.calls[0]?.[0];
    expect(header?.get('Authorization')).toBe(`Bearer ${session.session.token}`);
  });
});
