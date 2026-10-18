import { describe, expect, it } from 'vitest';
import { defaultLocalePreferences, parseLocalePreferences, resolveLocale } from './locales';
import { renderMessage } from './format';
import { catalogues, createTranslator, formatLocalizedDate } from './index';
import type { Message } from './types';

describe('locale negotiation and direction', () => {
  it('respects ranked browser languages and regional variants', () => {
    expect(resolveLocale(defaultLocalePreferences, ['de-DE', 'hu-HU', 'en-US']).language).toBe(
      'hu',
    );
    expect(resolveLocale(defaultLocalePreferences, ['en-GB', 'hu']).language).toBe('en');
    expect(resolveLocale(defaultLocalePreferences, ['HU_hu']).language).toBe('hu');
  });
  it('uses English for unsupported languages without pretending they are translated', () => {
    expect(resolveLocale(defaultLocalePreferences, ['ar', 'he'])).toMatchObject({
      language: 'en',
      direction: 'ltr',
    });
    expect(resolveLocale(defaultLocalePreferences, []).language).toBe('en');
  });
  it('keeps explicit language independent from the layout direction', () => {
    expect(resolveLocale({ language: 'hu', direction: 'rtl' }, ['en'])).toMatchObject({
      language: 'hu',
      direction: 'rtl',
    });
    expect(resolveLocale({ language: 'en', direction: 'auto' }, ['hu']).language).toBe('en');
  });
  it('recovers invalid saved preferences field by field', () => {
    expect(parseLocalePreferences({ language: 'constructor', direction: 'rtl' })).toEqual({
      language: 'auto',
      direction: 'rtl',
    });
    expect(parseLocalePreferences(null)).toEqual(defaultLocalePreferences);
    expect(parseLocalePreferences({ language: 'hu', direction: 'sideways' })).toEqual({
      language: 'hu',
      direction: 'auto',
    });
  });
});

describe('translated presentation', () => {
  it('localizes complete plural sentences and numeric placeholders', () => {
    expect(createTranslator('en')('ui.feed.count', { count: 1 })).toBe('1 feed');
    expect(createTranslator('en')('ui.feed.count', { count: 2 })).toBe('2 feeds');
    expect(createTranslator('hu')('ui.feed.count', { count: 2 })).toContain('2');
    expect(renderMessage('{count}', 'hu', { count: 10000 })).toBe(
      new Intl.NumberFormat('hu').format(10000),
    );
  });
  it('supports the additional plural categories needed by future RTL languages', () => {
    const message = {
      zero: 'zero',
      one: 'one',
      two: 'two',
      few: 'few',
      many: 'many',
      other: 'other',
    };
    for (const [count, expected] of [
      [0, 'zero'],
      [1, 'one'],
      [2, 'two'],
      [3, 'few'],
      [11, 'many'],
      [100, 'other'],
    ] as const) {
      expect(renderMessage(message, 'ar', { count })).toBe(expected);
    }
    expect(renderMessage({ other: '{count} items' }, 'ar', { count: 2 })).toContain('items');
  });
  it('formats dates at render time rather than freezing a browser language in the model', () => {
    const date = new Date('2026-10-18T12:30:00Z');
    for (const language of ['en', 'hu'] as const) {
      expect(formatLocalizedDate(date, language)).toBe(
        new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date),
      );
    }
    expect(formatLocalizedDate(null, 'hu')).toBe('Még nem');
    expect(formatLocalizedDate(new Date('invalid'), 'hu')).toBe('Ismeretlen');
  });
  it('does not interpret translated/interpolated text as HTML', () => {
    expect(renderMessage('Topic: {topic}', 'en', { topic: '<img src=x onerror=alert(1)>' })).toBe(
      'Topic: <img src=x onerror=alert(1)>',
    );
  });
  it('keeps every catalogue key and interpolation token complete across languages', () => {
    const tokens = (message: Message): string[] =>
      [
        ...new Set(
          (typeof message === 'string' ? [message] : Object.values(message)).flatMap(
            (text) => text.match(/\{[A-Za-z][A-Za-z0-9]*\}/g) ?? [],
          ),
        ),
      ].sort();
    const englishKeys = Object.keys(catalogues.en).sort();
    expect(Object.keys(catalogues.hu).sort()).toEqual(englishKeys);
    for (const key of englishKeys as (keyof typeof catalogues.en)[]) {
      expect(tokens(catalogues.hu[key]), key).toEqual(tokens(catalogues.en[key]));
      expect(
        Object.values(
          typeof catalogues.hu[key] === 'string'
            ? { text: catalogues.hu[key] }
            : catalogues.hu[key],
        ).every(Boolean),
        key,
      ).toBe(true);
    }
  });
});
