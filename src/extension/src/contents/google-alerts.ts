import type { PlasmoCSConfig } from 'plasmo';
import { inspectAlerts } from '../domain/catalog';
import { contextSchema } from '../infrastructure/protocol';

export const config: PlasmoCSConfig = {
  matches: ['https://www.google.com/alerts*'],
  run_at: 'document_idle',
};
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;

async function autoSync(): Promise<void> {
  if (stopped) return;
  try {
    const raw: unknown = await chrome.runtime.sendMessage({ type: 'signalpost:context' });
    const context = contextSchema.parse(raw);
    if (!context.autoSync) return;
    const inspection = inspectAlerts(document, context.boundSourceId);
    if (inspection.status === 'ready')
      await chrome.runtime.sendMessage({ type: 'signalpost:snapshot', inspection });
  } catch {
    // An unloaded extension or unavailable backend must never affect Google's own UI.
  }
}
function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void autoSync();
  }, 800);
}
const observer = new MutationObserver((mutations) => {
  if (
    mutations.some((mutation) => {
      const target =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return Boolean(target?.closest('#manage-alerts-div, .main-page'));
    })
  )
    schedule();
});
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['href', 'data-signed_in', 'hidden', 'style'],
});
chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id ||
    typeof raw !== 'object' ||
    raw === null ||
    !('type' in raw) ||
    raw.type !== 'signalpost:read'
  )
    return false;
  const boundSourceId =
    'boundSourceId' in raw && typeof raw.boundSourceId === 'string' ? raw.boundSourceId : undefined;
  sendResponse(inspectAlerts(document, boundSourceId));
  return false;
});
window.addEventListener(
  'pagehide',
  () => {
    stopped = true;
    observer.disconnect();
    if (timer) clearTimeout(timer);
  },
  { once: true },
);
schedule();
