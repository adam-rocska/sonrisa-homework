import {
  parseLocalePreferences,
  resolveLocale,
  type LocalePreferences,
  type ResolvedLocale,
} from './locales';

export const localeStorageKey = 'localePreferences';
export function browserLanguages(): readonly string[] {
  if (typeof navigator !== 'undefined' && navigator.languages.length) return navigator.languages;
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage)
    return [chrome.i18n.getUILanguage()];
  return ['en'];
}
export async function getLocale(): Promise<ResolvedLocale> {
  const stored = await chrome.storage.local.get(localeStorageKey);
  return resolveLocale(parseLocalePreferences(stored[localeStorageKey]), browserLanguages());
}
// Serialize partial writes so rapid language/direction changes preserve each other.
let pendingWrite: Promise<unknown> = Promise.resolve();
export function updateLocalePreferences(
  patch: Partial<LocalePreferences>,
): Promise<ResolvedLocale> {
  const operation = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      const stored = await chrome.storage.local.get(localeStorageKey);
      const next = parseLocalePreferences({
        ...parseLocalePreferences(stored[localeStorageKey]),
        ...patch,
      });
      await chrome.storage.local.set({ [localeStorageKey]: next });
      return resolveLocale(next, browserLanguages());
    });
  pendingWrite = operation;
  return operation;
}
