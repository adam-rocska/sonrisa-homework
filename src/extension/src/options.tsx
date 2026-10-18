import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  catalogReplaceInput,
  destinationSaveInput,
  feedConfigureInput,
} from '@signalpost/contracts';
import { isEditingTarget, isMacPlatform, shortcutFor } from './domain/shortcuts';
import {
  mapAdmin,
  mapCatalog,
  mapDelivery,
  mapDestination,
  mapViewer,
  type AdminOverview,
  type Catalog,
  type Delivery,
  type Destination,
  type Feed,
  type Viewer,
} from './domain/view-models';
import { createApi } from './infrastructure/api';
import { signIn, signOut } from './infrastructure/auth';
import { resultSchema } from './infrastructure/protocol';
import {
  defaultSettings,
  getSession,
  getSettings,
  getSyncStatus,
  normalizeApiBaseUrl,
  saveSettings,
  setBinding,
  setSession,
  syncStatusSchema,
  type Settings,
  type SyncStatus,
} from './infrastructure/storage';
import { LocaleProvider, useLocale } from './i18n/react';
import { isLanguage, locales } from './i18n/locales';
import { localizeError, translateActionResult, translateSyncStatus } from './i18n/errors';
import type { UiMessageKey } from './i18n/ui.en';
import './ui/styles.css';

type Section = 'feeds' | 'destinations' | 'activity' | 'admin' | 'settings';
const sectionLabels: Record<Section, UiMessageKey> = {
  feeds: 'ui.section.feeds',
  destinations: 'ui.section.destinations',
  activity: 'ui.section.activity',
  admin: 'ui.section.admin',
  settings: 'ui.section.settings',
};
const initialCatalog: Catalog = { sourceId: null, syncedAt: null, feeds: [] };
type Notice =
  | { readonly kind: 'message'; readonly key: UiMessageKey }
  | { readonly kind: 'error'; readonly value: unknown }
  | { readonly kind: 'action'; readonly result: ReturnType<typeof resultSchema.parse> };

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function FeedCard({
  feed,
  destinations,
  busy,
  save,
}: {
  feed: Feed;
  destinations: readonly Destination[];
  busy: boolean;
  save: (feedId: string, enabled: boolean, destinationIds: string[]) => Promise<void>;
}) {
  const { t, formatDate } = useLocale();
  const [enabled, setEnabled] = useState(feed.isEnabled);
  const [routes, setRoutes] = useState([...feed.routes]);
  return (
    <article className="card" aria-label={feed.label}>
      <div className="card-header">
        <h3>
          <bdi dir="auto">{feed.label}</bdi>
        </h3>
        <span className="badge">{t(feed.isEnabled ? 'ui.feed.watching' : 'ui.feed.paused')}</span>
      </div>
      <div className="meta">
        <span>
          {t('ui.feed.checked')}: <bdi>{formatDate(feed.lastChecked)}</bdi>
        </span>
        <span>
          {t('ui.feed.nextCheck')}: <bdi>{formatDate(feed.nextCheck)}</bdi>
        </span>
      </div>
      {feed.issue && (
        <p className="status error">
          <bdi dir="auto">{localizeError(feed.issue, t)}</bdi>
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        {t('ui.feed.watch')}
      </label>
      <fieldset>
        <legend>{t('ui.feed.sendTo')}</legend>
        {destinations.length === 0 ? (
          <p className="muted">{t('ui.feed.addDestination')}</p>
        ) : (
          destinations.map((destination) => (
            <label className="check" key={destination.id}>
              <input
                type="checkbox"
                checked={routes.includes(destination.id)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRoutes((previous) =>
                    checked
                      ? [...previous, destination.id]
                      : previous.filter((id) => id !== destination.id),
                  );
                }}
              />
              <bdi dir="auto">{destination.label}</bdi>{' '}
              <small>
                ({t(`ui.channel.${destination.channel}`)}
                {destination.isEnabled ? '' : `, ${t('ui.feed.paused')}`})
              </small>
            </label>
          ))
        )}
      </fieldset>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => {
          void save(feed.id, enabled, routes);
        }}
      >
        {t('ui.feed.save')}
      </button>
    </article>
  );
}
function DeliveryList({
  deliveries,
  retry,
  busy,
}: {
  deliveries: readonly Delivery[];
  retry?: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const { t, formatDate } = useLocale();
  if (deliveries.length === 0)
    return (
      <Empty title={t('ui.delivery.empty')}>
        <p>{t('ui.delivery.emptyHelp')}</p>
      </Empty>
    );
  return (
    <div>
      {deliveries.map((delivery) => (
        <article className="card" key={delivery.id}>
          <div className="card-header">
            <h3>
              {delivery.href ? (
                <a href={delivery.href} target="_blank" rel="noreferrer">
                  <bdi dir="auto">{delivery.title || t('ui.delivery.untitled')}</bdi>
                </a>
              ) : (
                <bdi dir="auto">{delivery.title || t('ui.delivery.untitled')}</bdi>
              )}
            </h3>
            <span className={`badge ${delivery.status}`}>
              {t(`ui.delivery.${delivery.status}`)}
            </span>
          </div>
          <div className="meta">
            <span>
              {t('ui.delivery.feed')}:{' '}
              <bdi dir="auto">{delivery.feedLabel ?? t('ui.delivery.removedFeed')}</bdi>
            </span>
            <span>
              {t('ui.delivery.destination')}:{' '}
              <bdi dir="auto">
                {delivery.destinationLabel ?? t('ui.delivery.removedDestination')}
              </bdi>
            </span>
          </div>
          <div className="meta">
            <span>
              <bdi>{formatDate(delivery.happenedAt)}</bdi>
            </span>
            <span>{t('ui.delivery.attempts', { count: delivery.attempts })}</span>
          </div>
          {delivery.issue && (
            <p className="status error">
              <bdi dir="auto">{localizeError(delivery.issue, t)}</bdi>
            </p>
          )}
          {retry && delivery.status === 'failed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void retry(delivery.id);
              }}
            >
              {t('ui.delivery.retry')}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function OptionsPage() {
  const {
    t,
    preference,
    directionPreference,
    setPreference,
    setDirectionPreference,
    formatDate,
    formatNumber,
  } = useLocale();
  const [section, setSection] = useState<Section>('feeds');
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const [destinations, setDestinations] = useState<readonly Destination[]>([]);
  const [deliveries, setDeliveries] = useState<readonly Delivery[]>([]);
  const [admin, setAdmin] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'email' | 'slack'>('email');
  const [target, setTarget] = useState('');
  const [destinationEnabled, setDestinationEnabled] = useState(true);
  const [clearConfirmed, setClearConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mac = isMacPlatform(navigator.platform);
  const modifier = mac ? '⌘' : 'Ctrl';

  const refresh = useCallback(async (preserveDrafts = false): Promise<void> => {
    const session = await getSession();
    if (!preserveDrafts) {
      const [storedSettings, status] = await Promise.all([getSettings(), getSyncStatus()]);
      setSettings(storedSettings);
      setSyncStatusState(status);
    }
    if (!session) {
      setViewer(null);
      setCatalog(initialCatalog);
      setDestinations([]);
      setDeliveries([]);
      setAdmin(null);
      return;
    }
    const api = await createApi();
    const user = await api.me.query();
    if (!user) {
      await setSession(null);
      setViewer(null);
      setCatalog(initialCatalog);
      setDestinations([]);
      setDeliveries([]);
      setAdmin(null);
      throw new Error('Your Signalpost session expired. Sign in again.');
    }
    setViewer(mapViewer(user));
    const [catalogDto, destinationDtos, deliveryDtos] = await Promise.all([
      api.catalog.get.query(),
      api.destination.list.query(),
      api.delivery.list.query(),
    ]);
    const nextCatalog = mapCatalog(catalogDto);
    const nextDestinations = destinationDtos.map(mapDestination);
    setCatalog(nextCatalog);
    setDestinations(nextDestinations);
    setDeliveries(
      deliveryDtos.map((delivery) => mapDelivery(delivery, nextCatalog, nextDestinations)),
    );
    if (nextCatalog.sourceId) await setBinding(nextCatalog.sourceId, session);
    if (user.role === 'admin')
      setAdmin(mapAdmin(await api.admin.overview.query(), nextCatalog, nextDestinations));
    else setAdmin(null);
  }, []);
  const perform = useCallback(
    async (action: () => Promise<void>, success?: UiMessageKey): Promise<void> => {
      setBusy(true);
      setNotice(null);
      try {
        await action();
        await refresh();
        if (success) setNotice({ kind: 'message', key: success });
      } catch (error: unknown) {
        setNotice({ kind: 'error', value: error });
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  const sync = useCallback(async (): Promise<void> => {
    await perform(async () => {
      const result = resultSchema.parse(
        await chrome.runtime.sendMessage({ type: 'signalpost:sync' }),
      );
      setNotice({ kind: 'action', result });
    });
  }, [perform]);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    let refreshRequested = false;
    void refresh().catch((error: unknown) => setNotice({ kind: 'error', value: error }));
    // Background sync changes server data, not the user's unsaved form fields.
    // Serialize reads and collapse bursts so an older result cannot win a race.
    const refreshAfterSync = async (): Promise<void> => {
      refreshRequested = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (active && refreshRequested) {
          refreshRequested = false;
          try {
            await refresh(true);
          } catch (error: unknown) {
            if (active) setNotice({ kind: 'error', value: error });
          }
        }
      } finally {
        refreshing = false;
      }
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area !== 'local' || !changes['syncStatus']) return;
      const parsed = syncStatusSchema.safeParse(changes['syncStatus'].newValue);
      setSyncStatusState(parsed.success ? parsed.data : null);
      if (parsed.success && parsed.data.state === 'success') void refreshAfterSync();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [refresh]);
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      const shortcut = shortcutFor(event, mac, isEditingTarget(event.target));
      if (!shortcut) return;
      if (shortcut === 'dismiss' && !dialog.current?.open) return;
      event.preventDefault();
      if (shortcut === 'dismiss') dialog.current?.close();
      else if (shortcut === 'commands' || shortcut === 'help') dialog.current?.showModal();
      else if (shortcut === 'settings') setSection('settings');
      else if (!busy) void sync();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [busy, mac, sync]);
  function navigate(next: Section): void {
    setSection(next);
    dialog.current?.close();
    requestAnimationFrame(() => heading.current?.focus());
  }
  function editDestination(destination: Destination | null): void {
    setEditingDestination(destination);
    setLabel(destination?.label ?? '');
    setKind(destination?.channel ?? 'email');
    setTarget('');
    setDestinationEnabled(destination?.isEnabled ?? true);
  }
  async function saveDestination(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = destinationSaveInput.parse({
      ...(editingDestination ? { id: editingDestination.id } : {}),
      label,
      kind,
      enabled: destinationEnabled,
      ...(target.trim() ? { target: target.trim() } : {}),
    });
    await perform(async () => {
      const api = await createApi();
      await api.destination.save.mutate(input);
      editDestination(null);
    }, 'ui.notice.destinationSaved');
  }
  async function updateSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const origin = normalizeApiBaseUrl(settings.apiBaseUrl);
      // Request only this server, directly within the user's submit gesture.
      const allowed = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!allowed)
        throw new Error('Server access was not granted. Your settings were not changed.');
      await perform(async () => {
        const previous = await getSettings();
        if (previous.apiBaseUrl !== origin) await setSession(null);
        await saveSettings({ ...settings, apiBaseUrl: origin });
      }, 'ui.notice.settingsSaved');
    } catch (error: unknown) {
      setNotice({ kind: 'error', value: error });
    }
  }
  const sections: readonly Section[] = viewer?.isAdmin
    ? ['feeds', 'destinations', 'activity', 'admin', 'settings']
    : ['feeds', 'destinations', 'activity', 'settings'];
  const noticeIsError =
    notice?.kind === 'error' || (notice?.kind === 'action' && !notice.result.ok);
  return (
    <>
      <a className="skip" href="#main">
        {t('ui.skip')}
      </a>
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <h1>Signalpost</h1>
            <small>{t('ui.tagline')}</small>
          </div>
        </div>
        <div className="header-actions">
          <span className="header-identity muted">
            {viewer ? <bdi dir="ltr">{viewer.email}</bdi> : t('ui.signedOut')}
          </span>
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            aria-keyshortcuts="Control+k Meta+k"
          >
            {t('ui.commands')} <kbd dir="ltr">{modifier} K</kbd>
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              void sync();
            }}
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {t('ui.sync')}
          </button>
        </div>
      </header>
      <div className="layout">
        <nav aria-label="Signalpost">
          <>
            {sections.map((item) => (
              <button
                type="button"
                key={item}
                aria-current={section === item ? 'page' : undefined}
                onClick={() => navigate(item)}
              >
                {t(sectionLabels[item])}
              </button>
            ))}
          </>
          <div className="nav-foot">
            {t('ui.desktop')}
            <br />
            <a href="https://www.google.com/alerts" target="_blank" rel="noreferrer">
              {t('ui.openAlerts')} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </nav>
        <main id="main" aria-busy={busy}>
          <div className="section-intro">
            <h2 ref={heading} tabIndex={-1}>
              {t(sectionLabels[section])}
            </h2>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {notice && (
              <p
                className={`status ${noticeIsError ? 'error' : ''}`}
                role={noticeIsError ? 'alert' : 'status'}
              >
                <bdi dir="auto">
                  {notice.kind === 'message'
                    ? t(notice.key)
                    : notice.kind === 'action'
                      ? translateActionResult(notice.result, t)
                      : localizeError(notice.value, t)}
                </bdi>
              </p>
            )}
          </div>
          {syncStatus && (
            <p className={`status ${syncStatus.state === 'error' ? 'error' : ''}`}>
              <bdi dir="auto">{translateSyncStatus(syncStatus, t)}</bdi>{' '}
              <small>
                · <bdi>{formatDate(new Date(syncStatus.at))}</bdi>
              </small>
            </p>
          )}
          {!viewer && section !== 'settings' && (
            <div className="card">
              <h3>{t('ui.auth.connect')}</h3>
              <p>{t('ui.auth.intro')}</p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  void perform(async () => {
                    await signIn();
                  }, 'ui.notice.signedIn');
                }}
              >
                {t('ui.auth.continue')}
              </button>
              <p className="field-help">{t('ui.auth.localSetup')}</p>
            </div>
          )}
          {section === 'feeds' && (
            <>
              <p className="muted">{t('ui.feed.intro')}</p>
              <div className="meta">
                <span>{t('ui.feed.count', { count: catalog.feeds.length })}</span>
                <span>
                  {t('ui.feed.lastSynced')}: <bdi>{formatDate(catalog.syncedAt)}</bdi>
                </span>
              </div>
              {catalog.feeds.length === 0 ? (
                <Empty title={t('ui.feed.start')}>
                  <ol>
                    <li>{t('ui.feed.stepCreate')}</li>
                    <li>{t('ui.feed.stepRss')}</li>
                    <li>{t('ui.feed.stepSync')}</li>
                    <li>{t('ui.feed.stepDestination')}</li>
                  </ol>
                  <p className="muted">{t('ui.feed.baseline')}</p>
                </Empty>
              ) : (
                catalog.feeds.map((feed) => (
                  <FeedCard
                    key={`${feed.id}:${feed.isEnabled}:${feed.routes.join(',')}`}
                    feed={feed}
                    destinations={destinations}
                    busy={busy}
                    save={async (feedId, enabled, destinationIds) => {
                      await perform(async () => {
                        const api = await createApi();
                        await api.feed.configure.mutate(
                          feedConfigureInput.parse({ feedId, enabled, destinationIds }),
                        );
                      }, 'ui.notice.routingSaved');
                    }}
                  />
                ))
              )}
            </>
          )}
          {section === 'destinations' && viewer && (
            <>
              <p className="muted">{t('ui.destination.intro')}</p>
              <form
                className="card stack"
                onSubmit={(event) => {
                  void saveDestination(event).catch((error: unknown) =>
                    setNotice({ kind: 'error', value: error }),
                  );
                }}
              >
                <h3>{t(editingDestination ? 'ui.destination.edit' : 'ui.destination.add')}</h3>
                <label>
                  {t('ui.destination.name')}
                  <input
                    required
                    maxLength={100}
                    dir="auto"
                    value={label}
                    onChange={(event) => setLabel(event.currentTarget.value)}
                    placeholder={t('ui.destination.namePlaceholder')}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {t('ui.destination.channel')}
                  <select
                    disabled={editingDestination !== null}
                    value={kind}
                    onChange={(event) =>
                      setKind(event.currentTarget.value === 'slack' ? 'slack' : 'email')
                    }
                  >
                    <option value="email">{t('ui.channel.email')}</option>
                    <option value="slack">{t('ui.channel.slack')}</option>
                  </select>
                </label>
                <label>
                  {t(kind === 'email' ? 'ui.destination.email' : 'ui.destination.webhook')}
                  <input
                    type={kind === 'email' ? 'email' : 'url'}
                    dir="ltr"
                    required={!editingDestination}
                    value={target}
                    onChange={(event) => setTarget(event.currentTarget.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={
                      editingDestination
                        ? t('ui.destination.retain')
                        : kind === 'email'
                          ? 'you@example.com'
                          : 'https://hooks.slack.com/services/…'
                    }
                  />
                </label>
                {kind === 'slack' && (
                  <p className="field-help">{t('ui.destination.webhookHelp')}</p>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={destinationEnabled}
                    onChange={(event) => setDestinationEnabled(event.currentTarget.checked)}
                  />
                  {t('ui.destination.enable')}
                </label>
                <div className="actions">
                  <button className="primary" disabled={busy} type="submit">
                    {t(editingDestination ? 'ui.saveChanges' : 'ui.destination.add')}
                  </button>
                  {editingDestination && (
                    <button type="button" onClick={() => editDestination(null)}>
                      {t('ui.cancel')}
                    </button>
                  )}
                </div>
              </form>
              {destinations.map((destination) => (
                <article className="card" key={destination.id}>
                  <div className="card-header">
                    <div>
                      <h3>
                        <bdi dir="auto">{destination.label}</bdi>
                      </h3>
                      <p className="muted">
                        {t(`ui.channel.${destination.channel}`)} ·{' '}
                        {t(destination.isEnabled ? 'ui.destination.enabled' : 'ui.feed.paused')}
                      </p>
                    </div>
                    <div className="actions">
                      <button type="button" onClick={() => editDestination(destination)}>
                        {t('ui.edit')}
                        <span className="sr-only">
                          {' '}
                          <bdi dir="auto">{destination.label}</bdi>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              t('ui.destination.removeConfirm', {
                                name: `\u2068${destination.label}\u2069`,
                              }),
                            )
                          )
                            void perform(async () => {
                              const api = await createApi();
                              await api.destination.remove.mutate({ id: destination.id });
                            }, 'ui.notice.destinationRemoved');
                        }}
                      >
                        {t('ui.remove')}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </>
          )}
          {section === 'activity' && viewer && (
            <>
              <p className="muted">{t('ui.delivery.intro')}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void perform(refresh);
                }}
              >
                {t('ui.delivery.refresh')}
              </button>
              <div className="separator">
                <DeliveryList deliveries={deliveries} busy={busy} />
              </div>
            </>
          )}
          {section === 'admin' && viewer?.isAdmin && admin && (
            <>
              <p className="muted">{t('ui.admin.intro')}</p>
              <div className="stats">
                {(
                  [
                    ['ui.admin.users', admin.userCount],
                    ['ui.admin.feeds', admin.feedCount],
                    ['ui.admin.destinations', admin.destinationCount],
                    ['ui.delivery.pending', admin.pendingCount],
                    ['ui.delivery.failed', admin.failedCount],
                    ['ui.delivery.accepted', admin.acceptedCount],
                  ] as const
                ).map(([name, value]) => (
                  <div className="stat" key={name}>
                    <span>{t(name)}</span>
                    <strong>
                      <bdi>{formatNumber(value)}</bdi>
                    </strong>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void perform(refresh);
                }}
              >
                {t('ui.admin.refresh')}
              </button>
              <div className="separator">
                <h3>{t('ui.admin.recent')}</h3>
                <DeliveryList
                  deliveries={admin.deliveries}
                  busy={busy}
                  retry={async (deliveryId) => {
                    await perform(async () => {
                      const api = await createApi();
                      await api.admin.retry.mutate({ deliveryId });
                    }, 'ui.notice.retry');
                  }}
                />
              </div>
            </>
          )}
          {section === 'settings' && (
            <>
              <div className="card stack">
                <h3>{t('ui.settings.appearance')}</h3>
                <label>
                  {t('ui.settings.language')}
                  <select
                    value={preference}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      void setPreference(isLanguage(value) ? value : 'auto').catch(
                        (error: unknown) => setNotice({ kind: 'error', value: error }),
                      );
                    }}
                  >
                    <option value="auto">{t('ui.settings.autoLanguage')}</option>
                    {Object.entries(locales).map(([code, locale]) => (
                      <option key={code} value={code} lang={code}>
                        {locale.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field-help">{t('ui.settings.languageHelp')}</p>
                <label>
                  {t('ui.settings.direction')}
                  <select
                    value={directionPreference}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      void setDirectionPreference(
                        value === 'ltr' || value === 'rtl' ? value : 'auto',
                      ).catch((error: unknown) => setNotice({ kind: 'error', value: error }));
                    }}
                  >
                    <option value="auto">{t('ui.settings.autoDirection')}</option>
                    <option value="ltr">{t('ui.settings.ltr')}</option>
                    <option value="rtl">{t('ui.settings.rtl')}</option>
                  </select>
                </label>
                <p className="field-help">{t('ui.settings.directionHelp')}</p>
              </div>
              <form
                className="card stack"
                onSubmit={(event) => {
                  void updateSettings(event);
                }}
              >
                <h3>{t('ui.settings.connection')}</h3>
                <label>
                  {t('ui.settings.server')}
                  <input
                    type="url"
                    dir="ltr"
                    required
                    value={settings.apiBaseUrl}
                    onChange={(event) => {
                      const apiBaseUrl = event.currentTarget.value;
                      setSettings((previous) => ({ ...previous, apiBaseUrl }));
                    }}
                    spellCheck={false}
                  />
                </label>
                <p className="field-help">
                  {t('ui.settings.serverHelp')} <bdi dir="ltr">http://localhost:3000</bdi>.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.autoSync}
                    onChange={(event) => {
                      const autoSync = event.currentTarget.checked;
                      setSettings((previous) => ({ ...previous, autoSync }));
                    }}
                  />
                  {t('ui.settings.autoSync')}
                </label>
                <p className="field-help">{t('ui.settings.autoSyncHelp')}</p>
                <button type="submit" className="primary" disabled={busy}>
                  {t('ui.settings.save')}
                </button>
              </form>
              <div className="card">
                <h3>{t('ui.auth.heading')}</h3>
                <p>
                  {viewer ? (
                    <>
                      {t('ui.auth.signedInAs')} <bdi dir="auto">{viewer.displayName}</bdi> (
                      <bdi dir="ltr">{viewer.email}</bdi>).
                    </>
                  ) : (
                    t('ui.auth.independent')
                  )}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void perform(
                      async () => {
                        if (viewer) {
                          try {
                            await signOut();
                          } finally {
                            setViewer(null);
                            setCatalog(initialCatalog);
                            setDestinations([]);
                            setDeliveries([]);
                            setAdmin(null);
                          }
                        } else await signIn();
                      },
                      viewer ? 'ui.notice.signedOut' : 'ui.notice.signedIn',
                    );
                  }}
                >
                  {t(viewer ? 'ui.auth.signOut' : 'ui.auth.continue')}
                </button>
                <p className="field-help">{t('ui.auth.sessionHelp')}</p>
                <details className="separator">
                  <summary>{t('ui.auth.callback')}</summary>
                  <p className="code" dir="ltr">
                    {chrome.identity.getRedirectURL('auth')}
                  </p>
                  <p className="field-help">{t('ui.auth.callbackHelp')}</p>
                </details>
              </div>
              <div className="card">
                <h3>{t('ui.keyboard.heading')}</h3>
                <ul className="shortcut-list">
                  {(
                    [
                      [`${modifier} K`, 'ui.commands'],
                      [`${modifier} Enter`, 'ui.keyboard.sync'],
                      [`${modifier} ,`, 'ui.section.settings'],
                      ['?', 'ui.keyboard.help'],
                      ['Esc', 'ui.keyboard.close'],
                    ] as const
                  ).map(([key, label]) => (
                    <li key={key}>
                      <kbd dir="ltr">{key}</kbd>
                      <span>{t(label)}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  {t('ui.keyboard.hint')} <bdi dir="ltr">chrome://extensions/shortcuts</bdi>.
                </p>
              </div>
              {viewer && catalog.sourceId && (
                <div className="card danger-zone">
                  <h3>{t('ui.clear.heading')}</h3>
                  <p>{t('ui.clear.help')}</p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={clearConfirmed}
                      onChange={(event) => setClearConfirmed(event.currentTarget.checked)}
                    />
                    {t('ui.clear.confirm')}
                  </label>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy || !clearConfirmed}
                    onClick={() => {
                      const sourceId = catalog.sourceId;
                      if (sourceId)
                        void perform(async () => {
                          const api = await createApi();
                          await api.catalog.replace.mutate(
                            catalogReplaceInput.parse({ sourceId, feeds: [] }),
                          );
                          setClearConfirmed(false);
                        }, 'ui.notice.cleared');
                    }}
                  >
                    {t('ui.clear.action')}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <dialog ref={dialog} aria-labelledby="commands-title">
        <div className="card-header">
          <h2 id="commands-title">{t('ui.commands')}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={t('ui.commands.close')}
          >
            {t('ui.keyboard.close')}
          </button>
        </div>
        <div className="stack">
          {sections.map((item) => (
            <button type="button" key={item} onClick={() => navigate(item)}>
              {t(sectionLabels[item])}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              dialog.current?.close();
              void sync();
            }}
          >
            {t('ui.sync')} <kbd dir="ltr">{modifier} Enter</kbd>
          </button>
        </div>
        <p className="field-help">{t('ui.commands.help')}</p>
      </dialog>
    </>
  );
}
export default function Options() {
  return (
    <LocaleProvider>
      <OptionsPage />
    </LocaleProvider>
  );
}
