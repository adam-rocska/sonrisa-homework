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
  errorMessage,
  getSession,
  getSettings,
  getSyncStatus,
  normalizeApiBaseUrl,
  saveSettings,
  setBinding,
  setSession,
  type Settings,
  type SyncStatus,
} from './infrastructure/storage';
import './ui/styles.css';

type Section = 'feeds' | 'destinations' | 'activity' | 'admin' | 'settings';
const sectionLabels: Record<Section, string> = {
  feeds: 'My feeds',
  destinations: 'Destinations',
  activity: 'Delivery activity',
  admin: 'Administration',
  settings: 'Settings',
};
const initialCatalog: Catalog = { sourceId: null, syncedAt: 'Not yet', feeds: [] };
interface Notice {
  readonly error: boolean;
  readonly text: string;
}

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
  const [enabled, setEnabled] = useState(feed.isEnabled);
  const [routes, setRoutes] = useState([...feed.routes]);
  return (
    <article className="card" aria-label={feed.label}>
      <div className="card-header">
        <h3>{feed.label}</h3>
        <span className="badge">{feed.isEnabled ? 'Watching' : 'Paused'}</span>
      </div>
      <div className="meta">
        <span>Checked: {feed.lastChecked}</span>
        <span>Next check: {feed.nextCheck}</span>
      </div>
      {feed.issue && <p className="status error">{feed.issue}</p>}
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        Watch this feed
      </label>
      <fieldset>
        <legend>Send new items to</legend>
        {destinations.length === 0 ? (
          <p className="muted">Add an email or Slack destination first.</p>
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
              {destination.label}{' '}
              <small>
                ({destination.channel}
                {destination.isEnabled ? '' : ', paused'})
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
        Save routing
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
  if (deliveries.length === 0)
    return (
      <Empty title="No deliveries yet">
        <p>
          New feed items appear here after the first baseline has been recorded and a destination
          has been selected.
        </p>
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
                  {delivery.title || 'Untitled item'}
                </a>
              ) : (
                delivery.title || 'Untitled item'
              )}
            </h3>
            <span className={`badge ${delivery.status}`}>{delivery.status}</span>
          </div>
          <p className="muted">
            {delivery.feedLabel} → {delivery.destinationLabel}
          </p>
          <div className="meta">
            <span>{delivery.happenedAt}</span>
            <span>{delivery.attempts} attempts</span>
          </div>
          {delivery.issue && <p className="status error">{delivery.issue}</p>}
          {retry && delivery.status === 'failed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void retry(delivery.id);
              }}
            >
              Retry delivery
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function OptionsPage() {
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

  const refresh = useCallback(async (): Promise<void> => {
    const [storedSettings, session, status] = await Promise.all([
      getSettings(),
      getSession(),
      getSyncStatus(),
    ]);
    setSettings(storedSettings);
    setSyncStatusState(status);
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
    async (action: () => Promise<void>, success?: string): Promise<void> => {
      setBusy(true);
      setNotice(null);
      try {
        await action();
        await refresh();
        if (success) setNotice({ error: false, text: success });
      } catch (error: unknown) {
        setNotice({ error: true, text: errorMessage(error) });
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
      if (!result.ok) throw new Error(result.message);
      setNotice({ error: false, text: result.message });
    });
  }, [perform]);
  useEffect(() => {
    void refresh().catch((error: unknown) => setNotice({ error: true, text: errorMessage(error) }));
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area === 'local' && changes['syncStatus']) void getSyncStatus().then(setSyncStatusState);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
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
    }, 'Destination saved.');
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
      }, 'Settings saved. Sign in again if you changed servers.');
    } catch (error: unknown) {
      setNotice({ error: true, text: errorMessage(error) });
    }
  }
  const sections: readonly Section[] = viewer?.isAdmin
    ? ['feeds', 'destinations', 'activity', 'admin', 'settings']
    : ['feeds', 'destinations', 'activity', 'settings'];
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <h1>Signalpost</h1>
            <small>Your alerts. Your channels.</small>
          </div>
        </div>
        <div className="header-actions">
          <span className="header-identity muted">{viewer?.email ?? 'Not signed in'}</span>
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            aria-keyshortcuts="Control+k Meta+k"
          >
            Commands <kbd>{modifier} K</kbd>
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
            Sync Google Alerts
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
                {sectionLabels[item]}
              </button>
            ))}
          </>
          <div className="nav-foot">
            Built for your desktop.
            <br />
            <a href="https://www.google.com/alerts" target="_blank" rel="noreferrer">
              Open Google Alerts ↗
            </a>
          </div>
        </nav>
        <main id="main" aria-busy={busy}>
          <div className="section-intro">
            <h2 ref={heading} tabIndex={-1}>
              {sectionLabels[section]}
            </h2>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {notice && (
              <p
                className={`status ${notice.error ? 'error' : ''}`}
                role={notice.error ? 'alert' : 'status'}
              >
                {notice.text}
              </p>
            )}
          </div>
          {syncStatus && (
            <p className={`status ${syncStatus.state === 'error' ? 'error' : ''}`}>
              {syncStatus.message} <small>· {new Date(syncStatus.at).toLocaleString()}</small>
            </p>
          )}
          {!viewer && section !== 'settings' && (
            <div className="card">
              <h3>Connect your Signalpost account</h3>
              <p>
                Sign in with Google to keep your feeds and destinations together. Signing in to
                Google Alerts alone does not sign you in here.
              </p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  void perform(async () => {
                    await signIn();
                  }, 'Signed in to Signalpost.');
                }}
              >
                Continue with Google
              </button>
              <p className="field-help">For local setup, configure the server in Settings first.</p>
            </div>
          )}
          {section === 'feeds' && (
            <>
              <p className="muted">
                Manage topics in Google Alerts. Signalpost imports the complete RSS catalog and
                delivers new items to the destinations you choose.
              </p>
              <div className="meta">
                <span>{catalog.feeds.length} feeds</span>
                <span>Last synced: {catalog.syncedAt}</span>
              </div>
              {catalog.feeds.length === 0 ? (
                <Empty title="Start with a topic worth following">
                  <ol>
                    <li>Open Google Alerts and create an alert.</li>
                    <li>
                      Choose <strong>Deliver to → RSS feed</strong>.
                    </li>
                    <li>Press the Signalpost toolbar button to sync.</li>
                    <li>Add a destination here and select it on the feed.</li>
                  </ol>
                  <p className="muted">
                    Email-only Google Alerts are not imported. The first fetch establishes a
                    baseline; existing items are not sent.
                  </p>
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
                      }, 'Feed routing saved.');
                    }}
                  />
                ))
              )}
            </>
          )}
          {section === 'destinations' && viewer && (
            <>
              <p className="muted">
                Use an email address or a Slack incoming webhook. Delivery credentials are kept on
                the server and never shown back in this app.
              </p>
              <form
                className="card stack"
                onSubmit={(event) => {
                  void saveDestination(event).catch((error: unknown) =>
                    setNotice({ error: true, text: errorMessage(error) }),
                  );
                }}
              >
                <h3>{editingDestination ? 'Edit destination' : 'Add destination'}</h3>
                <label>
                  Name
                  <input
                    required
                    maxLength={100}
                    value={label}
                    onChange={(event) => setLabel(event.currentTarget.value)}
                    placeholder="My inbox or team news"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Channel
                  <select
                    disabled={editingDestination !== null}
                    value={kind}
                    onChange={(event) =>
                      setKind(event.currentTarget.value === 'slack' ? 'slack' : 'email')
                    }
                  >
                    <option value="email">Email</option>
                    <option value="slack">Slack</option>
                  </select>
                </label>
                <label>
                  {kind === 'email' ? 'Email address' : 'Slack incoming webhook URL'}
                  <input
                    type={kind === 'email' ? 'email' : 'url'}
                    required={!editingDestination}
                    value={target}
                    onChange={(event) => setTarget(event.currentTarget.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={
                      editingDestination
                        ? 'Leave blank to retain the existing destination'
                        : kind === 'email'
                          ? 'you@example.com'
                          : 'https://hooks.slack.com/services/…'
                    }
                  />
                </label>
                {kind === 'slack' && (
                  <p className="field-help">
                    Create an incoming webhook in your own Slack workspace. Keep this URL private.
                  </p>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={destinationEnabled}
                    onChange={(event) => setDestinationEnabled(event.currentTarget.checked)}
                  />
                  Enable delivery
                </label>
                <div className="actions">
                  <button className="primary" disabled={busy} type="submit">
                    {editingDestination ? 'Save changes' : 'Add destination'}
                  </button>
                  {editingDestination && (
                    <button type="button" onClick={() => editDestination(null)}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              {destinations.map((destination) => (
                <article className="card" key={destination.id}>
                  <div className="card-header">
                    <div>
                      <h3>{destination.label}</h3>
                      <p className="muted">
                        {destination.channel} · {destination.isEnabled ? 'Enabled' : 'Paused'}
                      </p>
                    </div>
                    <div className="actions">
                      <button type="button" onClick={() => editDestination(destination)}>
                        Edit<span className="sr-only"> {destination.label}</span>
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${destination.label}? Its routing will stop.`))
                            void perform(async () => {
                              const api = await createApi();
                              await api.destination.remove.mutate({ id: destination.id });
                            }, 'Destination removed.');
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </>
          )}
          {section === 'activity' && viewer && (
            <>
              <p className="muted">
                Accepted means the email service or Slack accepted the message. It does not prove
                the recipient read it.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void perform(refresh);
                }}
              >
                Refresh activity
              </button>
              <div className="separator">
                <DeliveryList deliveries={deliveries} busy={busy} />
              </div>
            </>
          )}
          {section === 'admin' && viewer?.isAdmin && admin && (
            <>
              <p className="muted">
                A server-wide operational view. Administrator access is checked by the server on
                every request.
              </p>
              <div className="stats">
                {[
                  ['Connected users', admin.userCount],
                  ['Feeds', admin.feedCount],
                  ['Destinations', admin.destinationCount],
                  ['Pending', admin.pendingCount],
                  ['Failed', admin.failedCount],
                  ['Accepted', admin.acceptedCount],
                ].map(([name, value]) => (
                  <div className="stat" key={name}>
                    <span>{name}</span>
                    <strong>{value}</strong>
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
                Refresh administration
              </button>
              <div className="separator">
                <h3>Recent deliveries</h3>
                <DeliveryList
                  deliveries={admin.deliveries}
                  busy={busy}
                  retry={async (deliveryId) => {
                    await perform(async () => {
                      const api = await createApi();
                      await api.admin.retry.mutate({ deliveryId });
                    }, 'Delivery scheduled for another attempt.');
                  }}
                />
              </div>
            </>
          )}
          {section === 'settings' && (
            <>
              <form
                className="card stack"
                onSubmit={(event) => {
                  void updateSettings(event);
                }}
              >
                <h3>Connection</h3>
                <label>
                  Server address
                  <input
                    type="url"
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
                  Use HTTPS for a remote server. Local development defaults to
                  http://localhost:3000. Changing servers signs you out.
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
                  Automatically sync when Google Alerts loads or changes
                </label>
                <p className="field-help">
                  The manual toolbar button remains available. Google Alerts must be open for
                  automatic catalog sync; server delivery continues with your browser closed.
                </p>
                <button type="submit" className="primary" disabled={busy}>
                  Save settings
                </button>
              </form>
              <div className="card">
                <h3>Google sign-in</h3>
                <p>
                  {viewer
                    ? `Signed in as ${viewer.displayName} (${viewer.email}).`
                    : 'Sign in to Signalpost using Google. Your Google Alerts page has its own independent sign-in.'}
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
                      viewer ? 'Signed out.' : 'Signed in.',
                    );
                  }}
                >
                  {viewer ? 'Sign out of Signalpost' : 'Continue with Google'}
                </button>
                <p className="field-help">
                  The session is kept in trusted extension memory and is cleared when the browser
                  closes.
                </p>
                <details className="separator">
                  <summary>Developer setup: OAuth callback</summary>
                  <p className="code">{chrome.identity.getRedirectURL('auth')}</p>
                  <p className="field-help">
                    Allow this exact callback in the server's extension redirect configuration. Keep
                    a stable extension ID for repeatable local setup.
                  </p>
                </details>
              </div>
              <div className="card">
                <h3>Keyboard access</h3>
                <p>
                  <kbd>{modifier} K</kbd> Commands · <kbd>{modifier} Enter</kbd> Sync ·{' '}
                  <kbd>{modifier} ,</kbd> Settings · <kbd>?</kbd> Help · <kbd>Esc</kbd> Close
                </p>
                <p className="muted">
                  Shortcuts do not intercept typing. Use Tab and Shift+Tab to reach every control.
                  Browser-wide shortcuts can be changed at chrome://extensions/shortcuts.
                </p>
              </div>
              {viewer && catalog.sourceId && (
                <div className="card danger-zone">
                  <h3>Clear synced feeds</h3>
                  <p>
                    If you removed every RSS alert in Google, explicitly clear the catalog here.
                    Signalpost will not interpret an unknown or loading Google page as a request to
                    delete your feeds.
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={clearConfirmed}
                      onChange={(event) => setClearConfirmed(event.currentTarget.checked)}
                    />
                    I want to remove all synced feeds and stop their routing.
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
                        }, 'The synced catalog was cleared. Your Google Alerts were not changed.');
                    }}
                  >
                    Clear all synced feeds
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <dialog ref={dialog} aria-labelledby="commands-title">
        <div className="card-header">
          <h2 id="commands-title">Commands</h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close commands">
            Close
          </button>
        </div>
        <div className="stack">
          {sections.map((item) => (
            <button type="button" key={item} onClick={() => navigate(item)}>
              {sectionLabels[item]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              dialog.current?.close();
              void sync();
            }}
          >
            Sync Google Alerts <kbd>{modifier} Enter</kbd>
          </button>
        </div>
        <p className="field-help">Use Tab, Shift+Tab and Enter. Escape closes this dialog.</p>
      </dialog>
    </>
  );
}
export default OptionsPage;
