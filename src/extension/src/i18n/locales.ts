import type { Direction } from './types';

export const locales = {
  en: { name: 'English', direction: 'ltr' },
  hu: { name: 'Magyar', direction: 'ltr' },
} as const satisfies Record<string, { readonly name: string; readonly direction: Direction }>;
export type Language = keyof typeof locales;
export type LanguagePreference = Language | 'auto';
export type DirectionPreference = Direction | 'auto';
export interface LocalePreferences {
  readonly language: LanguagePreference;
  readonly direction: DirectionPreference;
}
export interface ResolvedLocale {
  readonly language: Language;
  readonly direction: Direction;
  readonly preference: LanguagePreference;
  readonly directionPreference: DirectionPreference;
}
export const defaultLocalePreferences: LocalePreferences = { language: 'auto', direction: 'auto' };
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(locales, value);
}
export function parseLocalePreferences(value: unknown): LocalePreferences {
  const source = typeof value === 'object' && value !== null ? value : {};
  const language = 'language' in source ? source.language : undefined;
  const direction = 'direction' in source ? source.direction : undefined;
  return {
    language: language === 'auto' || isLanguage(language) ? language : 'auto',
    direction: direction === 'ltr' || direction === 'rtl' ? direction : 'auto',
  };
}
export function resolveLocale(
  preferences: LocalePreferences,
  browserLanguages: readonly string[],
): ResolvedLocale {
  let language: Language = 'en';
  if (preferences.language !== 'auto') language = preferences.language;
  else
    for (const candidate of browserLanguages) {
      const normalized = candidate.toLowerCase().replaceAll('_', '-');
      const base = normalized.split('-')[0];
      if (isLanguage(normalized)) {
        language = normalized;
        break;
      }
      if (isLanguage(base)) {
        language = base;
        break;
      }
    }
  return {
    language,
    direction:
      preferences.direction === 'auto' ? locales[language].direction : preferences.direction,
    preference: preferences.language,
    directionPreference: preferences.direction,
  };
}
