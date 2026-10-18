// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from './react';
import type { LocalePreferences } from './locales';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('live document localization', () => {
  it('updates text, document language and direction on persisted changes without refetching product data', async () => {
    let saved: LocalePreferences = { language: 'hu', direction: 'auto' };
    const listeners = new Set<
      (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
    >();
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: async () => ({ localePreferences: saved }) },
        onChanged: {
          addListener: (
            listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
          ) => listeners.add(listener),
          removeListener: (
            listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
          ) => listeners.delete(listener),
        },
      },
    });
    function Sample() {
      const { t } = useLocale();
      return <p>{t('ui.section.settings')}</p>;
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <LocaleProvider>
          <Sample />
        </LocaleProvider>,
      );
    });
    expect(host.textContent).toBe('Beállítások');
    expect(document.documentElement.lang).toBe('hu');
    expect(document.documentElement.dir).toBe('ltr');
    saved = { language: 'en', direction: 'rtl' };
    await act(async () => {
      for (const listener of listeners)
        listener({ localePreferences: { newValue: saved } }, 'local');
    });
    expect(host.textContent).toBe('Settings');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('rtl');
    await act(async () => root.unmount());
    expect(listeners.size).toBe(0);
  });
});
