import { describe, expect, it } from 'vitest';
import { mapCatalog, mapDelivery, mapDestination, mapViewer, parseTime } from './view-models';
describe('transport to extension model boundary', () => {
  it('maps roles and destination kinds into UI concepts', () => {
    expect(mapViewer({ id: 'u', name: '', email: 'a@example.com', role: 'admin' })).toMatchObject({
      displayName: 'a@example.com',
      isAdmin: true,
    });
    expect(
      mapDestination({
        id: 'd',
        label: 'Team',
        kind: 'slack',
        enabled: true,
        createdAt: 'x',
        updatedAt: 'x',
      }),
    ).toEqual({ id: 'd', label: 'Team', channel: 'slack', isEnabled: true });
  });
  it('copies route arrays instead of sharing mutable wire state', () => {
    const routes = ['d'];
    const result = mapCatalog({
      sourceId: '123',
      lastSyncedAt: null,
      feeds: [
        {
          id: 'f',
          sourceId: '123',
          query: 'Topic',
          feedUrl: 'https://example.com/rss',
          enabled: true,
          destinationIds: routes,
          lastFetchedAt: null,
          nextPollAt: '2026-10-18T00:00:00Z',
          baselineAt: null,
          lastError: null,
          createdAt: 'x',
          updatedAt: 'x',
        },
      ],
    });
    routes.push('changed');
    expect(result.feeds[0]?.routes).toEqual(['d']);
    expect(parseTime(null)).toBeNull();
    expect(Number.isNaN(parseTime('nonsense')?.getTime())).toBe(true);
    expect(result.feeds[0]?.nextCheck).toEqual(new Date('2026-10-18T00:00:00Z'));
  });
  it('never renders dangerous feed item URL schemes as hyperlinks', () => {
    const delivery = mapDelivery(
      {
        id: 'x',
        feedId: 'f',
        destinationId: 'd',
        title: 'News',
        itemUrl: 'javascript:alert(1)',
        state: 'failed',
        attempts: 2,
        nextAttemptAt: 'x',
        acceptedAt: null,
        lastError: 'Unavailable',
        createdAt: 'x',
        updatedAt: 'x',
      },
      { sourceId: null, syncedAt: null, feeds: [] },
      [],
    );
    expect(delivery.href).toBeNull();
    expect(delivery.status).toBe('failed');
  });
});
