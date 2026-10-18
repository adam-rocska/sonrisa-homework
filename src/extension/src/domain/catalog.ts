export interface AlertFeed {
  readonly feedUrl: string;
  readonly query: string;
}

export interface CatalogSnapshot {
  readonly sourceId: string;
  readonly feeds: readonly AlertFeed[];
}

export type CatalogInspection =
  | {
      readonly status: 'ready';
      readonly snapshot: CatalogSnapshot;
      readonly emailOnlyCount: number;
    }
  | { readonly status: 'signed-out' }
  | { readonly status: 'unavailable'; readonly reason: string };

function visible(element: Element): boolean {
  return (
    !element.closest('[hidden], [aria-hidden="true"]') &&
    !(
      element instanceof HTMLElement &&
      (element.style.display === 'none' || element.style.visibility === 'hidden')
    )
  );
}

/** The DOM adapter is deliberately fail-closed: unknown HTML is not an empty catalog. */
export function inspectAlerts(document: Document, boundSourceId?: string): CatalogInspection {
  const page = document.querySelector('.main-page');
  if (page?.getAttribute('data-signed_in') === '0') return { status: 'signed-out' };
  if (page?.getAttribute('data-signed_in') !== '1') {
    return {
      status: 'unavailable',
      reason: 'Google Alerts is still loading, or its page format changed.',
    };
  }
  const list = document.querySelector('#manage-alerts-div');
  if (!list)
    return { status: 'unavailable', reason: 'The complete alerts list is not available yet.' };
  if ([...document.querySelectorAll('#show_all_alerts, .show_all_alerts')].some(visible)) {
    return {
      status: 'unavailable',
      reason: 'Show all your Google Alerts before syncing the complete catalog.',
    };
  }
  const rows = [...list.querySelectorAll('li.alert_instance')];
  const feeds: AlertFeed[] = [];
  const sources = new Set<string>();
  const seenUrls = new Set<string>();
  let emailOnlyCount = 0;
  for (const row of rows) {
    const query = row.querySelector('.query_div span')?.textContent?.trim();
    if (!query)
      return {
        status: 'unavailable',
        reason: 'An alert has no readable query. Nothing was replaced.',
      };
    const anchors = [...row.querySelectorAll<HTMLAnchorElement>('a[href^="/alerts/feeds/"]')];
    if (anchors.length === 0) {
      // A rendered delivery row proves this is an email-only alert, not a loading skeleton.
      if (!row.querySelector('.delivery_settings_view')) {
        return { status: 'unavailable', reason: 'An alert is incomplete. Nothing was replaced.' };
      }
      emailOnlyCount += 1;
      continue;
    }
    if (anchors.length !== 1)
      return { status: 'unavailable', reason: 'An alert has ambiguous RSS links.' };
    const anchor = anchors[0];
    const href = anchor?.getAttribute('href') ?? '';
    const match = /^\/alerts\/feeds\/(\d+)\/(\d+)$/.exec(href);
    const sourceId = match?.[1];
    if (!sourceId)
      return { status: 'unavailable', reason: 'Google returned an unfamiliar feed address.' };
    const feedUrl = `https://www.google.com${href}`;
    if (seenUrls.has(feedUrl))
      return {
        status: 'unavailable',
        reason: 'Duplicate feed links were found. Nothing was replaced.',
      };
    seenUrls.add(feedUrl);
    sources.add(sourceId);
    feeds.push({ feedUrl, query });
  }
  if (sources.size > 1)
    return { status: 'unavailable', reason: 'Alerts from multiple Google accounts were found.' };
  const sourceId = [...sources][0] ?? boundSourceId;
  if (boundSourceId && sources.size > 0 && sourceId !== boundSourceId) {
    return {
      status: 'unavailable',
      reason:
        'This Google Alerts account differs from your connected account. Switch Google accounts before syncing.',
    };
  }
  if (!sourceId)
    return {
      status: 'unavailable',
      reason: 'Create one RSS alert first so Signalpost can identify this Google Alerts account.',
    };
  // A zero-row live Google DOM marker has not been verified. Keep the previous catalog.
  if (rows.length === 0) {
    return {
      status: 'unavailable',
      reason:
        'The alerts list is empty but not confirmed ready. Use Signalpost settings to explicitly clear the synced catalog.',
    };
  }
  return { status: 'ready', snapshot: { sourceId, feeds }, emailOnlyCount };
}
