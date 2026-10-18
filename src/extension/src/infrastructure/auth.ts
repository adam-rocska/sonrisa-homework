import { getLocale } from '../i18n/preferences';
import {
  authExchangeSchema,
  getSession,
  getSettings,
  setSession,
  type AuthSession,
} from './storage';

function base64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export async function signIn(): Promise<AuthSession> {
  const [settings, locale] = await Promise.all([getSettings(), getLocale()]);
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const redirectUri = chrome.identity.getRedirectURL('auth');
  const url = new URL(`${settings.apiBaseUrl}/auth/start`);
  url.search = new URLSearchParams({
    redirectUri,
    state,
    codeChallenge: challenge,
    lang: locale.language,
    dir: locale.direction,
  }).toString();
  const callback = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  if (!callback) throw new Error('Google sign-in did not return a result.');
  const result = new URL(callback);
  const expected = new URL(redirectUri);
  if (
    result.origin !== expected.origin ||
    result.pathname !== expected.pathname ||
    result.searchParams.get('state') !== state
  ) {
    throw new Error('The sign-in callback could not be verified. Please try again.');
  }
  const code = result.searchParams.get('code');
  if (!code)
    throw new Error(result.searchParams.get('error') ?? 'Google sign-in was not completed.');
  const response = await fetch(`${settings.apiBaseUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Sign-in exchange failed (${response.status}). Check the server OAuth configuration.`,
    );
  const exchanged = authExchangeSchema.parse(await response.json());
  if ((await getSettings()).apiBaseUrl !== settings.apiBaseUrl)
    throw new Error(
      'The server changed while signing in. Start sign-in again for the current server.',
    );
  const session: AuthSession = { ...exchanged, apiBaseUrl: settings.apiBaseUrl };
  await setSession(session);
  return session;
}
export async function signOut(): Promise<void> {
  const session = await getSession();
  try {
    if (session) {
      const response = await fetch(`${session.apiBaseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(
          `Server sign-out failed (${response.status}); the local session was cleared.`,
        );
    }
  } finally {
    await setSession(null);
  }
}
