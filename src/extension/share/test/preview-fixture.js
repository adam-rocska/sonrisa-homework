/* global window, Request, URL, location, Response */
(() => {
  const now = new Date().toISOString();
  const user = { id: 'preview-user', email: 'reviewer@example.test', name: 'Preview reviewer', role: 'admin' };
  const destinations = [
    { id: 'email-1', kind: 'email', label: 'Morning inbox', enabled: true, createdAt: now, updatedAt: now },
    { id: 'slack-1', kind: 'slack', label: '#world-watch', enabled: true, createdAt: now, updatedAt: now },
    { id: 'slack-2', kind: 'slack', label: '#market-research', enabled: false, createdAt: now, updatedAt: now }
  ];
  let catalog = { sourceId: '123456', lastSyncedAt: now, feeds: [
    { id: 'feed-1', sourceId: '123456', feedUrl: 'https://www.google.com/alerts/feeds/123456/100', query: 'Renewable energy breakthroughs', enabled: true, destinationIds: ['email-1', 'slack-1'], lastFetchedAt: now, nextPollAt: now, baselineAt: now, lastError: null, createdAt: now, updatedAt: now },
    { id: 'feed-2', sourceId: '123456', feedUrl: 'https://www.google.com/alerts/feeds/123456/200', query: 'European markets', enabled: false, destinationIds: ['slack-2'], lastFetchedAt: now, nextPollAt: now, baselineAt: now, lastError: 'Feed fetch timed out. Next attempt is scheduled automatically.', createdAt: now, updatedAt: now }
  ] };
  const deliveries = [
    { id: 'delivery-1', feedId: 'feed-1', destinationId: 'slack-1', title: 'New battery research reaches a commercial milestone', itemUrl: 'https://example.org/news', state: 'accepted', attempts: 1, nextAttemptAt: now, acceptedAt: now, lastError: null, createdAt: now, updatedAt: now },
    { id: 'delivery-2', feedId: 'feed-1', destinationId: 'email-1', title: 'Grid-scale storage project announced', itemUrl: 'https://example.org/news', state: 'failed', attempts: 3, nextAttemptAt: now, acceptedAt: null, lastError: 'Local mail transport is temporarily unavailable.', createdAt: now, updatedAt: now },
    { id: 'delivery-3', feedId: 'feed-2', destinationId: 'slack-2', title: 'Market briefing: the week ahead', itemUrl: 'https://example.org/news', state: 'pending', attempts: 0, nextAttemptAt: now, acceptedAt: null, lastError: null, createdAt: now, updatedAt: now }
  ];
  const stores = { local: { settings: { apiBaseUrl: 'http://localhost:3000', autoSync: true }, syncStatus: { state: 'success', message: '2 RSS feeds synced. 1 email-only alert was skipped.', at: now, feedCount: 2 } }, session: { auth: { token: 'local-preview-token', apiBaseUrl: 'http://localhost:3000', expiresAt: '2099-01-01T00:00:00.000Z', user } } };
  const localeKey = 'signalpost-preview-locale';
  try { stores.local.localePreferences = JSON.parse(window.localStorage.getItem(localeKey) || 'null'); } catch { /* invalid fixture preference resets to automatic */ }
  const changes = new Set();
  const storage = area => ({ get: async key => key ? { [key]: stores[area][key] } : { ...stores[area] }, set: async values => { Object.assign(stores[area], values); if (area === 'local' && values.localePreferences) window.localStorage.setItem(localeKey, JSON.stringify(values.localePreferences)); const updates = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{newValue:value}])); changes.forEach(fn => fn(updates,area)); }, remove: async key => { delete stores[area][key]; }, setAccessLevel: async () => {} });
  window.chrome = { storage: { local: storage('local'), session: storage('session'), onChanged: { addListener: fn => changes.add(fn), removeListener: fn => changes.delete(fn) } }, runtime: { id: 'preview', getURL: path => `chrome-extension://preview/${path}`, sendMessage: async () => ({ ok: true, message: 'Preview: complete snapshot sync simulated. No Google page was read.' }) }, identity: { getRedirectURL: path => `https://preview.chromiumapp.org/${path}`, launchWebAuthFlow: async () => { throw new Error('This local UI preview does not sign in to Google.'); } }, permissions: { request: async () => true } };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, location.href);
    if (url.origin !== 'http://localhost:3000') return originalFetch(input, init);
    if (url.pathname === '/api/auth/sign-out') return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (!url.pathname.startsWith('/trpc/')) throw new Error('No external auth or API calls in preview.');
    const names = decodeURIComponent(url.pathname.slice('/trpc/'.length)).split(',');
    const args = JSON.parse(typeof init?.body === 'string' ? init.body : url.searchParams.get('input') || '{}');
    const results = names.map((name,index) => {
      const data = args[index]?.json ?? args[index] ?? {};
      let result;
      if (name === 'me') result = user;
      else if (name === 'catalog.get') result = catalog;
      else if (name === 'destination.list') result = destinations;
      else if (name === 'delivery.list') result = deliveries;
      else if (name === 'admin.overview') result = { users: 3, feeds: catalog.feeds.length, destinations: destinations.length, pending: 1, failed: 1, accepted: 12, recentDeliveries: deliveries };
      else if (name === 'feed.configure') { const feed = catalog.feeds.find(f => f.id === data.feedId); if (feed) Object.assign(feed, { enabled: data.enabled, destinationIds: data.destinationIds }); result = feed; }
      else if (name === 'destination.save') { const existing = destinations.find(d => d.id === data.id); if (existing) Object.assign(existing, { label:data.label,kind:data.kind,enabled:data.enabled }); else destinations.push({ ...data, id: `preview-${destinations.length}`, createdAt: now, updatedAt: now }); result = existing ?? destinations.at(-1); }
      else if (name === 'destination.remove') { const i = destinations.findIndex(d => d.id === data.id); if (i >= 0) destinations.splice(i,1); result = { ok:true }; }
      else if (name === 'catalog.replace') { catalog = { ...catalog, feeds:[], lastSyncedAt: now }; result = catalog; }
      else if (name === 'admin.retry') { const delivery = deliveries.find(d => d.id === data.deliveryId); if (delivery) delivery.state = 'pending'; result = { ok:true }; }
      else result = null;
      return { result: { data: result } };
    });
    return new Response(JSON.stringify(url.searchParams.get('batch') === '1' ? results : results[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();
