// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogDto } from '@signalpost/contracts';
import Options from '../options';
import { createApi, type SignalpostApi } from '../infrastructure/api';
import type { SyncStatus } from '../infrastructure/storage';

vi.mock('../infrastructure/api', () => ({ createApi: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
const now = '2026-10-18T12:00:00.000Z';
const user = { id: 'user-1', email: 'test@example.test', name: 'Tester', role: 'user' as const };
let root: Root;
let host: HTMLDivElement;
let catalog: CatalogDto;
let listeners: Set<StorageListener>;
let local: Record<string, unknown>;
const readCatalog = vi.fn<() => Promise<CatalogDto>>();

function emit(changes: Record<string, chrome.storage.StorageChange>, area = 'local'): void {
  for (const listener of listeners) listener(changes, area);
}
function button(text: string, selector = 'button'): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>(selector)].find(
    (candidate) => candidate.textContent === text,
  );
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
function input(selector: string): HTMLInputElement {
  const found = host.querySelector<HTMLInputElement>(selector);
  if (!found) throw new Error(`Input not found: ${selector}`);
  return found;
}
function typeInto(field: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
function newCatalog(label = 'New alert'): CatalogDto {
  return {
    sourceId: '123',
    lastSyncedAt: now,
    feeds: [
      {
        id: 'feed-1',
        sourceId: '123',
        feedUrl: 'https://www.google.com/alerts/feeds/123/456',
        query: label,
        enabled: true,
        destinationIds: [],
        lastFetchedAt: null,
        nextPollAt: now,
        baselineAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}
function syncEvent(state: SyncStatus['state'] = 'success'): void {
  const status: SyncStatus = { state, message: `Sync ${state}`, at: now, feedCount: 1 };
  local['syncStatus'] = status;
  emit({ syncStatus: { newValue: status } });
}

beforeEach(async () => {
  listeners = new Set();
  local = {
    settings: { apiBaseUrl: 'http://localhost:3000', autoSync: true },
    localePreferences: { language: 'en', direction: 'auto' },
  };
  catalog = { sourceId: null, lastSyncedAt: null, feeds: [] };
  readCatalog.mockReset().mockImplementation(async () => catalog);
  vi.mocked(createApi).mockResolvedValue({
    me: { query: async () => user },
    catalog: { get: { query: readCatalog } },
    destination: { list: { query: async () => [] } },
    delivery: { list: { query: async () => [] } },
  } as unknown as SignalpostApi);
  vi.stubGlobal('chrome', {
    identity: { getRedirectURL: () => 'https://test.chromiumapp.org/auth' },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: local[key] }),
        set: async (values: Record<string, unknown>) => {
          Object.assign(local, values);
          emit(
            Object.fromEntries(
              Object.entries(values).map(([key, newValue]) => [key, { newValue }]),
            ),
          );
        },
      },
      session: {
        get: async () => ({
          auth: {
            token: 'test-session',
            apiBaseUrl: 'http://localhost:3000',
            expiresAt: '2099-01-01T00:00:00.000Z',
            user,
          },
        }),
      },
      onChanged: {
        addListener: (listener: StorageListener) => listeners.add(listener),
        removeListener: (listener: StorageListener) => listeners.delete(listener),
      },
    },
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Options />));
  // jsdom does not implement the native dialog methods used by navigation.
  Object.defineProperty(host.querySelector('dialog'), 'close', { value: vi.fn() });
  expect(readCatalog).toHaveBeenCalledTimes(1);
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(listeners.size).toBe(0);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('open Options after a background catalog sync', () => {
  it('shows added feeds while retaining an unsaved server address and avoids storage feedback loops', async () => {
    await act(async () => button('Settings', 'nav button').click());
    await act(async () => typeInto(input('input[type="url"]'), 'https://unsaved.example.test'));
    expect(input('input[type="url"]').value).toBe('https://unsaved.example.test');
    await act(async () => {
      syncEvent('syncing');
      syncEvent('error');
      emit({ settings: { newValue: local['settings'] } });
      emit({ syncStatus: { newValue: { state: 'success' } } });
    });
    expect(readCatalog).toHaveBeenCalledTimes(1);
    catalog = newCatalog();
    await act(async () => syncEvent());
    expect(readCatalog).toHaveBeenCalledTimes(2);
    expect(input('input[type="url"]').value).toBe('https://unsaved.example.test');
    await act(async () => button('My feeds', 'nav button').click());
    expect(host.querySelector('article[aria-label="New alert"]')).not.toBeNull();
    expect(readCatalog).toHaveBeenCalledTimes(2);
  });

  it('preserves an unfinished destination form while the feed catalog changes', async () => {
    await act(async () => button('Destinations', 'nav button').click());
    await act(async () => {
      typeInto(input('input[maxlength="100"]'), 'Draft destination');
      typeInto(input('input[type="email"]'), 'draft@example.test');
    });
    catalog = newCatalog();
    await act(async () => syncEvent());
    expect(input('input[maxlength="100"]').value).toBe('Draft destination');
    expect(input('input[type="email"]').value).toBe('draft@example.test');
    expect(readCatalog).toHaveBeenCalledTimes(2);
  });

  it('coalesces successes during an in-flight read and ends with the newest catalog', async () => {
    let resolveRead: ((value: CatalogDto) => void) | undefined;
    readCatalog.mockImplementationOnce(
      () =>
        new Promise<CatalogDto>((resolve) => {
          resolveRead = resolve;
        }),
    );
    await act(async () => syncEvent());
    expect(readCatalog).toHaveBeenCalledTimes(2);
    await act(async () => {
      syncEvent();
      syncEvent();
    });
    expect(readCatalog).toHaveBeenCalledTimes(2);
    catalog = newCatalog('Newest alert');
    await act(async () => resolveRead?.(newCatalog('Older alert')));
    expect(readCatalog).toHaveBeenCalledTimes(3);
    expect(host.querySelector('article[aria-label="Newest alert"]')).not.toBeNull();
    expect(host.querySelector('article[aria-label="Older alert"]')).toBeNull();
  });
});
