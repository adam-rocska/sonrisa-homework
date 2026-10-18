interface AuthMessages {
  readonly server: string;
  readonly serverIntro: string;
  readonly health: string;
  readonly configuration: string;
  readonly configurationIntro: string;
  readonly callback: string;
  readonly restart: string;
  readonly signIn: string;
  readonly chooseAccount: string;
  readonly starting: string;
  readonly continue: string;
  readonly opening: string;
  readonly cannotStart: string;
  readonly startError: string;
  readonly unexpected: string;
  readonly failed: string;
  readonly expired: string;
  readonly expiredHelp: string;
  readonly required: string;
  readonly requiredHelp: string;
  readonly invalidRequest: string;
  readonly redirectMissing: string;
  readonly tooMany: string;
}
const en: AuthMessages = {
  server: 'Signalpost server',
  serverIntro:
    'This server serves the Signalpost browser extension. Open the extension to sign in and manage your alerts.',
  health: 'Server health',
  configuration: 'Google sign-in needs configuration',
  configurationIntro: 'The server is running, but Google authentication has not been configured.',
  callback: 'Register this callback in your Google Web application client:',
  restart: 'After configuration, restart the server and sign in from the extension again.',
  signIn: 'Sign in to Signalpost',
  chooseAccount:
    'Google will ask which account you want to use. Choose the account whose alerts you will synchronize.',
  starting: 'Starting sign-in…',
  continue: 'Continue with Google',
  opening: 'Opening Google sign-in…',
  cannotStart: 'Sign-in could not start',
  startError: 'Google sign-in could not start. Check the server OAuth configuration.',
  unexpected: 'Unexpected authentication destination.',
  failed: 'Sign-in failed. Try again from the extension.',
  expired: 'Sign-in expired',
  expiredHelp:
    'Start sign-in again from the extension. The browser could not verify the original sign-in request.',
  required: 'Google sign-in required',
  requiredHelp: 'Sign in again with a verified Google email address from the extension.',
  invalidRequest: 'The sign-in request is invalid. Start again from the extension.',
  redirectMissing: 'The extension redirect is not configured on the server.',
  tooMany: 'Too many unfinished sign-ins. Try again later.',
};
const hu: AuthMessages = {
  server: 'Signalpost szerver',
  serverIntro:
    'Ez a szerver a Signalpost böngészőbővítményt szolgálja ki. A bejelentkezéshez és az értesítések kezeléséhez nyisd meg a bővítményt.',
  health: 'Szerverállapot',
  configuration: 'A Google-bejelentkezést még be kell állítani',
  configurationIntro: 'A szerver működik, de a Google-hitelesítés még nincs beállítva.',
  callback: 'Ezt a visszahívási címet add meg a Google webalkalmazás-kliensében:',
  restart: 'A beállítás után indítsd újra a szervert, és jelentkezz be újra a bővítményből.',
  signIn: 'Bejelentkezés a Signalpostba',
  chooseAccount:
    'A Google megkérdezi, melyik fiókot szeretnéd használni. Azt válaszd, amelyiknek az értesítéseit szinkronizálni szeretnéd.',
  starting: 'Bejelentkezés indítása…',
  continue: 'Folytatás Google-fiókkal',
  opening: 'Google-bejelentkezés megnyitása…',
  cannotStart: 'Nem indítható el a bejelentkezés',
  startError: 'Nem indítható el a Google-bejelentkezés. Ellenőrizd a szerver OAuth-beállításait.',
  unexpected: 'Váratlan hitelesítési célcím.',
  failed: 'Sikertelen bejelentkezés. Próbáld újra a bővítményből.',
  expired: 'A bejelentkezés lejárt',
  expiredHelp:
    'Indítsd újra a bejelentkezést a bővítményből. A böngésző nem tudta ellenőrizni az eredeti bejelentkezési kérést.',
  required: 'Google-bejelentkezés szükséges',
  requiredHelp: 'Jelentkezz be újra a bővítményből egy ellenőrzött Google-email-címmel.',
  invalidRequest: 'Érvénytelen bejelentkezési kérés. Indítsd újra a bővítményből.',
  redirectMissing: 'A bővítmény átirányítási címe nincs beállítva a szerveren.',
  tooMany: 'Túl sok befejezetlen bejelentkezés. Próbáld újra később.',
};
const locales = {
  en: { direction: 'ltr', messages: en },
  hu: { direction: 'ltr', messages: hu },
} as const;
type Language = keyof typeof locales;
export interface AuthLocale {
  readonly language: Language;
  readonly direction: 'ltr' | 'rtl';
  readonly messages: AuthMessages;
}
function knownLanguage(value: string | undefined): Language | undefined {
  const normalized = value?.trim().toLowerCase().split('-')[0];
  return normalized === 'en' || normalized === 'hu' ? normalized : undefined;
}
export function resolveAuthLocale(
  requested: string | undefined,
  direction: string | undefined,
  acceptLanguage: string | undefined,
): AuthLocale {
  const preferences = (acceptLanguage ?? '')
    .split(',')
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const weight = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = weight === undefined ? 1 : Number(weight.trim().slice(2));
      return { language: knownLanguage(tag), quality };
    })
    .filter(({ language, quality }) => language !== undefined && quality > 0 && quality <= 1)
    .sort((left, right) => right.quality - left.quality);
  const language = knownLanguage(requested) ?? preferences[0]?.language ?? 'en';
  return {
    language,
    direction: direction === 'rtl' || direction === 'ltr' ? direction : locales[language].direction,
    messages: locales[language].messages,
  };
}
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
/** Safe even if a future translation includes HTML-like text. */
export function scriptValue(value: string): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
export function authPage(
  locale: AuthLocale,
  title: string,
  body: string,
  script = '',
  nonce = '',
): string {
  return `<!doctype html><html lang="${locale.language}" dir="${locale.direction}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Signalpost</title><style>body{font:18px/1.6 system-ui;max-inline-size:38rem;margin:10vh auto;padding:1.5rem;background:#fafaf9;color:#17201b;overflow-wrap:anywhere}h1{line-height:1.2}button{font:inherit;padding:.75rem 1rem;border:2px solid #173d2a;border-radius:.5rem;background:#173d2a;color:white;cursor:pointer;max-inline-size:100%}button:focus-visible,a:focus-visible{outline:3px solid #dc6900;outline-offset:4px}code{overflow-wrap:anywhere;direction:ltr;unicode-bidi:isolate}p[role=alert]{color:#8b1c11}</style><main><h1>${escapeHtml(title)}</h1>${body}</main>${script === '' ? '' : `<script nonce="${escapeHtml(nonce)}">${script}</script>`}</html>`;
}
export function handoffMessage(locale: AuthLocale, message: string): string {
  if (message === 'The extension redirect is not configured on the server.')
    return locale.messages.redirectMissing;
  if (message === 'Too many unfinished sign-ins. Try again later.') return locale.messages.tooMany;
  return locale.messages.invalidRequest;
}
