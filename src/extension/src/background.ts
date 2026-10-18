import notificationIcon from 'url:../assets/icon.png';
import { SnapshotCoordinator } from './application/snapshot-coordinator';
import type { CatalogInspection, CatalogSnapshot } from './domain/catalog';
import { createApiFor } from './infrastructure/api';
import { sameIdentity, type SyncIdentity } from './application/sync-identity';
import {
  inspectionSchema,
  isAlertsUrl,
  messageSchema,
  type ActionResult,
} from './infrastructure/protocol';
import {
  errorMessage,
  getBinding,
  getSession,
  getSettings,
  setSyncStatus,
} from './infrastructure/storage';

interface SyncRequest {
  readonly snapshot: CatalogSnapshot;
  readonly identity: SyncIdentity;
}
async function currentIdentity(): Promise<SyncIdentity | null> {
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  return session?.apiBaseUrl === settings.apiBaseUrl
    ? { userId: session.user.id, apiBaseUrl: session.apiBaseUrl, token: session.token }
    : null;
}
const coordinator = new SnapshotCoordinator<SyncRequest>(async ({ snapshot, identity }) => {
  if (!sameIdentity(identity, await currentIdentity()))
    throw new Error('Your account or server changed. Sync again from the current account.');
  const binding = await getBinding();
  if (binding && binding !== snapshot.sourceId)
    throw new Error('This Google Alerts account differs from the connected account.');
  const api = createApiFor(identity.apiBaseUrl, identity.token);
  await api.catalog.replace.mutate({ sourceId: snapshot.sourceId, feeds: [...snapshot.feeds] });
  if (!sameIdentity(identity, await currentIdentity()))
    throw new Error('Your account or server changed while syncing. Refresh the current account.');
  // Write the captured principal's key; never read a new identity during this write.
  await chrome.storage.local.set({
    [`binding:${identity.apiBaseUrl}:${identity.userId}`]: snapshot.sourceId,
  });
});

async function notify(message: string): Promise<void> {
  try {
    await chrome.notifications.create('signalpost-status', {
      type: 'basic',
      iconUrl: notificationIcon,
      title: 'Signalpost',
      message,
    });
  } catch {
    // OS notification preferences must not turn a successful sync into a failed one.
  }
}
async function syncInspection(
  inspection: CatalogInspection,
  manual: boolean,
): Promise<ActionResult> {
  const at = new Date().toISOString();
  let identity: SyncIdentity | null = null;
  try {
    if (inspection.status === 'signed-out')
      throw new Error('Please sign in to Google Alerts first, then press Signalpost again.');
    if (inspection.status === 'unavailable') throw new Error(inspection.reason);
    if (inspection.snapshot.feeds.length === 0)
      throw new Error(
        'No RSS links are visible, so this Google account cannot be verified. Use Settings → Clear synced feeds to explicitly empty the catalog.',
      );
    identity = await currentIdentity();
    if (!identity)
      throw new Error(
        'Sign in to Signalpost first. Its Google sign-in is separate from the Google Alerts page.',
      );
    await setSyncStatus({
      state: 'syncing',
      at,
      message: 'Replacing your catalog with the complete Google Alerts snapshot…',
    });
    await coordinator.enqueue({ snapshot: inspection.snapshot, identity });
    if (!sameIdentity(identity, await currentIdentity()))
      throw new Error('Your account or server changed. Sync again.');
    const message = `${inspection.snapshot.feeds.length} RSS feeds synced.${inspection.emailOnlyCount ? ` ${inspection.emailOnlyCount} email-only alerts were skipped.` : ''}`;
    await setSyncStatus({
      state: 'success',
      at: new Date().toISOString(),
      message,
      feedCount: inspection.snapshot.feeds.length,
    });
    await chrome.action.setBadgeText({ text: '' });
    if (manual) await notify(message);
    return { ok: true, message };
  } catch (error: unknown) {
    const message = errorMessage(error);
    if (identity && !sameIdentity(identity, await currentIdentity())) return { ok: false, message };
    await setSyncStatus({ state: 'error', at, message });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#aa251d' });
    if (manual) await notify(message);
    return { ok: false, message };
  }
}
async function readTab(tabId: number): Promise<CatalogInspection> {
  const binding = await getBinding();
  const response: unknown = await chrome.tabs.sendMessage(tabId, {
    type: 'signalpost:read',
    ...(binding ? { boundSourceId: binding } : {}),
  });
  return inspectionSchema.parse(response);
}
async function openOrSync(clickedTab?: chrome.tabs.Tab): Promise<ActionResult> {
  let tab = clickedTab;
  if (!tab || !isAlertsUrl(tab.url)) {
    const existing = await chrome.tabs.query({ url: 'https://www.google.com/alerts*' });
    const target = existing.find((candidate) => isAlertsUrl(candidate.url));
    if (target?.id !== undefined) {
      await chrome.tabs.update(target.id, { active: true });
      if (target.windowId !== undefined)
        await chrome.windows.update(target.windowId, { focused: true });
      tab = target;
    } else {
      await chrome.tabs.create({ url: 'https://www.google.com/alerts' });
      return {
        ok: true,
        message: 'Google Alerts opened. Sign in, set RSS delivery, then press Signalpost to sync.',
      };
    }
    if (clickedTab)
      return { ok: true, message: 'Google Alerts opened. Press Signalpost again to sync.' };
  }
  if (tab?.id === undefined) return { ok: false, message: 'Open Google Alerts and try again.' };
  try {
    return await syncInspection(await readTab(tab.id), true);
  } catch (error: unknown) {
    const message = `Reload Google Alerts and try again. ${errorMessage(error)}`;
    await notify(message);
    return { ok: false, message };
  }
}

chrome.action.onClicked.addListener((tab) => {
  void openOrSync(tab).catch((error) => notify(errorMessage(error)));
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') void chrome.runtime.openOptionsPage();
  if (command === 'sync-alerts') void openOrSync().catch((error) => notify(errorMessage(error)));
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});
chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success || sender.id !== chrome.runtime.id) return false;
  const fromAlerts = isAlertsUrl(sender.url) && sender.tab?.id !== undefined;
  const fromApp =
    (sender.url?.startsWith(chrome.runtime.getURL('')) === true && sender.tab === undefined) ||
    sender.url?.startsWith(chrome.runtime.getURL('options.html')) === true;
  const message = parsed.data;
  if (
    (message.type === 'signalpost:context' || message.type === 'signalpost:snapshot') &&
    !fromAlerts
  )
    return false;
  if ((message.type === 'signalpost:sync' || message.type === 'signalpost:open') && !fromApp)
    return false;
  const operation = async (): Promise<unknown> => {
    if (message.type === 'signalpost:context') {
      const [settings, boundSourceId] = await Promise.all([getSettings(), getBinding()]);
      return { autoSync: settings.autoSync, ...(boundSourceId ? { boundSourceId } : {}) };
    }
    if (message.type === 'signalpost:snapshot') {
      if (!(await getSettings()).autoSync)
        return { ok: true, message: 'Automatic sync is disabled.' };
      return syncInspection(message.inspection, false);
    }
    if (message.type === 'signalpost:sync') return openOrSync();
    await chrome.runtime.openOptionsPage();
    return { ok: true, message: 'Signalpost opened.' };
  };
  void operation()
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({ ok: false, message: errorMessage(error) }));
  return true;
});
