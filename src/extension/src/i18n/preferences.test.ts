import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocale, updateLocalePreferences } from './preferences';
let stored: Record<string, unknown>;
let write: ReturnType<typeof vi.fn>;
beforeEach(() => {
  stored = { settings: { apiBaseUrl: 'https://server.example', autoSync: true } };
  write = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(stored, values);
  });
  vi.stubGlobal('navigator', { languages: ['hu-HU', 'en-US'] });
  vi.stubGlobal('chrome', {
    storage: { local: { get: async (key: string) => ({ [key]: stored[key] }), set: write } },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('local-only language settings', () => {
  it('detects browser language for an existing installation without touching server settings', async () => {
    expect(await getLocale()).toMatchObject({ language: 'hu', preference: 'auto' });
    expect(write).not.toHaveBeenCalled();
  });
  it('preserves concurrent language and direction edits without changing server or account settings', async () => {
    await Promise.all([
      updateLocalePreferences({ language: 'en' }),
      updateLocalePreferences({ direction: 'rtl' }),
    ]);
    expect(await getLocale()).toMatchObject({ language: 'en', direction: 'rtl' });
    expect(stored['settings']).toEqual({ apiBaseUrl: 'https://server.example', autoSync: true });
  });
  it('reports a failed write and permits a later retry', async () => {
    write.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(updateLocalePreferences({ language: 'en' })).rejects.toThrow(
      'storage unavailable',
    );
    expect((await getLocale()).preference).toBe('auto');
    await updateLocalePreferences({ language: 'en' });
    expect((await getLocale()).language).toBe('en');
  });
});
