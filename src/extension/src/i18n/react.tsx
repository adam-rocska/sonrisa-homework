import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createTranslator, formatLocalizedDate, type Translator } from './index';
import {
  defaultLocalePreferences,
  resolveLocale,
  type DirectionPreference,
  type LanguagePreference,
  type ResolvedLocale,
} from './locales';
import {
  browserLanguages,
  getLocale,
  localeStorageKey,
  updateLocalePreferences,
} from './preferences';

interface LocaleContextValue extends ResolvedLocale {
  readonly t: Translator;
  readonly formatDate: (value: Date | string | number | null) => string;
  readonly formatNumber: (value: number) => string;
  readonly setPreference: (value: LanguagePreference) => Promise<void>;
  readonly setDirectionPreference: (value: DirectionPreference) => Promise<void>;
}
const LocaleContext = createContext<LocaleContextValue | null>(null);
export function applyDocumentLocale(
  document: Document,
  locale: ResolvedLocale,
  title: string,
): void {
  document.documentElement.lang = locale.language;
  document.documentElement.dir = locale.direction;
  document.title = title;
}
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(() =>
    resolveLocale(defaultLocalePreferences, browserLanguages()),
  );
  const t = useMemo(() => createTranslator(locale.language), [locale.language]);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = (): void => {
      const current = ++revision;
      void getLocale()
        .then((next) => {
          if (active && current === revision) setLocale(next);
        })
        .catch(() => undefined);
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area === 'local' && changes[localeStorageKey]) refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    window.addEventListener('languagechange', refresh);
    refresh();
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(changed);
      window.removeEventListener('languagechange', refresh);
    };
  }, []);
  useEffect(() => {
    applyDocumentLocale(document, locale, t('core.title'));
  }, [locale, t]);
  const setPreference = useCallback(async (language: LanguagePreference): Promise<void> => {
    setLocale(await updateLocalePreferences({ language }));
  }, []);
  const setDirectionPreference = useCallback(
    async (direction: DirectionPreference): Promise<void> => {
      setLocale(await updateLocalePreferences({ direction }));
    },
    [],
  );
  const value = useMemo<LocaleContextValue>(
    () => ({
      ...locale,
      t,
      setPreference,
      setDirectionPreference,
      formatDate: (date) => formatLocalizedDate(date, locale.language),
      formatNumber: (number) => new Intl.NumberFormat(locale.language).format(number),
    }),
    [locale, t, setPreference, setDirectionPreference],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('LocaleProvider is required.');
  return value;
}
