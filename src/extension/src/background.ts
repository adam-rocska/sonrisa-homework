import notificationIcon from 'url:../assets/icon.png';
import { createTranslator } from './i18n';
import { getLocale } from './i18n/preferences';
import {
  describeError,
  LocalizedError,
  translateActionResult,
  type SystemMessage,
} from './i18n/errors';
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
import { getBinding, getSession, getSettings, setSyncStatus } from './infrastructure/storage';

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
    throw new LocalizedError('error.identityChanged');
  const binding = await getBinding();
  if (binding && binding !== snapshot.sourceId) throw new LocalizedError('error.sourceMismatch');
  const api = createApiFor(identity.apiBaseUrl, identity.token);
  await api.catalog.replace.mutate({ sourceId: snapshot.sourceId, feeds: [...snapshot.feeds] });
  if (!sameIdentity(identity, await currentIdentity()))
    throw new LocalizedError('error.identityChanged');
  // Write the captured principal's key; never read a new identity during this write.
  await chrome.storage.local.set({
    [`binding:${identity.apiBaseUrl}:${identity.userId}`]: snapshot.sourceId,
  });
});

async function result(ok: boolean, descriptor: SystemMessage): Promise<ActionResult> {
  const t = createTranslator((await getLocale()).language);
  return { ok, ...descriptor, message: translateActionResult({ ...descriptor, message: '' }, t) };
}
async function notify(status: ActionResult): Promise<void> {
  try {
    await chrome.notifications.create('signalpost-status', {
      type: 'basic',
      iconUrl: notificationIcon,
      title: 'Signalpost',
      message: translateActionResult(status, createTranslator((await getLocale()).language)),
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
    if (inspection.status === 'signed-out') throw new LocalizedError('error.alertsSignIn');
    if (inspection.status === 'unavailable') throw new Error(inspection.reason);
    if (inspection.snapshot.feeds.length === 0) throw new LocalizedError('error.noRss');
    identity = await currentIdentity();
    if (!identity) throw new LocalizedError('error.signalpostSignIn');
    await setSyncStatus({
      ...(await result(true, { messageKey: 'sync.replacing' })),
      state: 'syncing',
      at,
    });
    await coordinator.enqueue({ snapshot: inspection.snapshot, identity });
    if (!sameIdentity(identity, await currentIdentity()))
      throw new LocalizedError('error.identityChanged');
    const status = await result(true, {
      messageKey: 'sync.success',
      messageParams: {
        count: inspection.snapshot.feeds.length,
        skipped: inspection.emailOnlyCount,
      },
    });
    await setSyncStatus({
      ...status,
      state: 'success',
      at: new Date().toISOString(),
      feedCount: inspection.snapshot.feeds.length,
      emailOnlyCount: inspection.emailOnlyCount,
    });
    await chrome.action.setBadgeText({ text: '' });
    if (manual) await notify(status);
    return status;
  } catch (error: unknown) {
    const status = await result(false, describeError(error));
    if (identity && !sameIdentity(identity, await currentIdentity())) return status;
    await setSyncStatus({ ...status, state: 'error', at });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#aa251d' });
    if (manual) await notify(status);
    return status;
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
      return result(true, { messageKey: 'sync.openedNew' });
    }
    if (clickedTab) return result(true, { messageKey: 'sync.opened' });
  }
  if (tab?.id === undefined) return result(false, { messageKey: 'sync.openFirst' });
  try {
    return await syncInspection(await readTab(tab.id), true);
  } catch {
    const status = await result(false, { messageKey: 'sync.reload' });
    await notify(status);
    return status;
  }
}
async function notifyFailure(error: unknown): Promise<void> {
  await notify(await result(false, describeError(error)));
}

chrome.action.onClicked.addListener((tab) => {
  void openOrSync(tab).catch(notifyFailure);
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') void chrome.runtime.openOptionsPage();
  if (command === 'sync-alerts') void openOrSync().catch(notifyFailure);
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
      if (!(await getSettings()).autoSync) return result(true, { messageKey: 'sync.disabled' });
      return syncInspection(message.inspection, false);
    }
    if (message.type === 'signalpost:sync') return openOrSync();
    await chrome.runtime.openOptionsPage();
    return result(true, { messageKey: 'sync.appOpened' });
  };
  void operation()
    .then(sendResponse)
    .catch(async (error: unknown) => sendResponse(await result(false, describeError(error))));
  return true;
});
