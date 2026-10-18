import uiEn from './ui.en';
import uiHu from './ui.hu';
import systemEn from './system.en';
import systemHu from './system.hu';
import { renderMessage } from './format';
import type { Language } from './locales';
import type { Message, MessageParams } from './types';

const coreEn = {
  'core.notYet': 'Not yet',
  'core.unknown': 'Unknown',
  'core.title': 'Signalpost · Alerts and delivery',
} as const;
const coreHu = {
  'core.notYet': 'Még nem',
  'core.unknown': 'Ismeretlen',
  'core.title': 'Signalpost · Értesítések és kézbesítés',
} satisfies Record<keyof typeof coreEn, Message>;
export const english = { ...coreEn, ...uiEn, ...systemEn };
export type MessageKey = keyof typeof english;
export type Catalogue = Record<MessageKey, Message>;
export const catalogues = {
  en: english,
  hu: { ...coreHu, ...uiHu, ...systemHu },
} satisfies Record<Language, Catalogue>;
export type Translator = (key: MessageKey, params?: MessageParams) => string;
export function createTranslator(language: Language): Translator {
  return (key, params) =>
    renderMessage(catalogues[language][key] ?? english[key], language, params);
}
export function formatLocalizedDate(
  value: Date | string | number | null,
  language: Language,
): string {
  const t = createTranslator(language);
  if (value === null) return t('core.notYet');
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return t('core.unknown');
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
