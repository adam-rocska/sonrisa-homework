import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { authPage, resolveAuthLocale, scriptValue } from '../src/auth-pages.js';
import { readConfig } from '../src/config.js';
import type { AuthBoundary } from '../src/identity.js';
import { fakeStore } from './fixtures.js';

function auth(configured = false): AuthBoundary {
  return {
    configured,
    handler: vi.fn(async () => new Response('unused')),
    getSession: vi.fn(async () => null),
    close: vi.fn(),
  };
}
describe('localized authentication pages', () => {
  it('uses weighted browser languages and ignores unacceptable languages', () => {
    expect(resolveAuthLocale(undefined, undefined, 'fr, en;q=0.3, hu-HU;q=0.9').language).toBe(
      'hu',
    );
    expect(resolveAuthLocale(undefined, undefined, 'hu;q=0, en;q=0.5').language).toBe('en');
    expect(resolveAuthLocale(undefined, undefined, 'hu;q=invalid').language).toBe('en');
  });
  it('lets allowlisted preferences override the browser without reflecting invalid input', () => {
    expect(resolveAuthLocale('hu', 'rtl', 'en').language).toBe('hu');
    expect(resolveAuthLocale('hu', 'rtl', 'en').direction).toBe('rtl');
    const locale = resolveAuthLocale('<script>', 'rtl" onclick="alert(1)', 'hu-HU');
    const html = authPage(locale, '<title>', '<p>Safe body</p>');
    expect(html).toContain('<html lang="hu" dir="ltr">');
    expect(html).toContain('&lt;title&gt;');
    expect(html).not.toContain('onclick');
  });
  it('escapes script values without changing their decoded text', () => {
    const value = '</script><script>alert("x")</script>\u2028\u2029';
    const encoded = scriptValue(value);
    expect(encoded).not.toContain('<');
    expect(encoded).not.toContain('\u2028');
    expect(encoded).not.toContain('\u2029');
    expect(JSON.parse(encoded)).toBe(value);
  });
  it('renders configuration and expired-flow screens in Hungarian with declared direction', async () => {
    const app = createApp({ config: readConfig({}), auth: auth(), store: fakeStore() });
    const response = await app.request('/auth/start?lang=hu&dir=rtl');
    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain('<html lang="hu" dir="rtl">');
    expect(html).toContain('A Google-bejelentkezést még be kell állítani');
    expect(html).toContain('GOOGLE_CLIENT_ID');
    const expired = await app.request('/auth/complete?lang=hu&dir=rtl&flow=invalid');
    expect(expired.status).toBe(400);
    expect(await expired.text()).toContain('A bejelentkezés lejárt');
  });
  it('preserves the selected language through the OAuth callback and nonce-protected script', async () => {
    const config = readConfig({ EXTENSION_IDS: 'a'.repeat(32) });
    const app = createApp({ config, auth: auth(true), store: fakeStore() });
    const query = new URLSearchParams({
      lang: 'hu',
      dir: 'rtl',
      redirectUri: config.extensionRedirects[0] ?? '',
      state: 's'.repeat(43),
      codeChallenge: createHash('sha256').update('v'.repeat(64)).digest('base64url'),
    });
    const response = await app.request(`/auth/start?${query.toString()}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Folytatás Google-fiókkal');
    expect(html).toContain('&lang=hu&dir=rtl');
    expect(html).toContain('Google-bejelentkezés megnyitása…');
    const nonce = html.match(/<script nonce="([^"]+)">/u)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get('Content-Security-Policy')).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  });
  it('localizes rejected sign-in requests and browser-selected root pages without changing status codes', async () => {
    const app = createApp({ config: readConfig({}), auth: auth(true), store: fakeStore() });
    const rejected = await app.request('/auth/start?lang=hu');
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain('A bővítmény átirányítási címe nincs beállítva');
    const root = await app.request('/', { headers: { 'Accept-Language': 'hu-HU,en;q=0.8' } });
    expect(await root.text()).toContain('Signalpost szerver');
  });
});
