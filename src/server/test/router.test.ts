import { DomainError } from '@signalpost/core';
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router.js';
import { catalog, destination, fakeStore, feed, principal, timestamp } from './fixtures.js';

describe('tRPC authorization and model mapping', () => {
  it('allows an anonymous session check but protects all product data', async () => {
    const store = fakeStore();
    const caller = appRouter.createCaller({ principal: null, store });
    expect(await caller.me()).toBeNull();
    await expect(caller.catalog.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.destination.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.delivery.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(store.getCatalog).not.toHaveBeenCalled();
  });
  it('uses the authenticated owner and explicitly converts domain models to DTOs', async () => {
    const store = fakeStore();
    const result = await appRouter.createCaller({ principal, store }).catalog.get();
    expect(store.getCatalog).toHaveBeenCalledWith(principal.id);
    expect(result.lastSyncedAt).toBe(timestamp.toISOString());
    expect(result.feeds[0]?.feedUrl).toBe(feed.url);
    expect(result.feeds[0]).not.toHaveProperty('userId');
    expect(result.feeds[0]).not.toHaveProperty('url');
    expect(catalog.lastSyncedAt).toBeInstanceOf(Date);
  });
  it('maps a replacement into the independent core input and permits an intentional empty snapshot', async () => {
    const store = fakeStore();
    const caller = appRouter.createCaller({ principal, store });
    await caller.catalog.replace({
      sourceId: '123',
      feeds: [{ feedUrl: feed.url, query: feed.query }],
    });
    expect(store.replaceCatalog).toHaveBeenCalledWith('user-1', '123', [
      { url: feed.url, query: feed.query },
    ]);
    await caller.catalog.replace({ sourceId: '123', feeds: [] });
    expect(store.replaceCatalog).toHaveBeenLastCalledWith('user-1', '123', []);
  });
  it('maps a source mismatch into an actionable conflict', async () => {
    const store = fakeStore();
    vi.mocked(store.replaceCatalog).mockImplementation(() => {
      throw new DomainError('SOURCE_MISMATCH', 'Google account does not match');
    });
    await expect(
      appRouter.createCaller({ principal, store }).catalog.replace({ sourceId: '123', feeds: [] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('keeps stored target secrets out of returned destinations', async () => {
    const store = fakeStore();
    const withSecret = { ...destination, target: 'https://hooks.slack.com/services/secret' };
    vi.mocked(store.listDestinations).mockReturnValue([withSecret]);
    const result = await appRouter.createCaller({ principal, store }).destination.list();
    expect(result[0]).not.toHaveProperty('target');
    expect(result[0]).not.toHaveProperty('userId');
  });
  it('preserves a secret when an update omits its replacement', async () => {
    const store = fakeStore();
    await appRouter
      .createCaller({ principal, store })
      .destination.save({ id: destination.id, kind: 'slack', label: 'New label', enabled: false });
    expect(store.updateDestination).toHaveBeenCalledWith(principal.id, destination.id, {
      label: 'New label',
      enabled: false,
    });
  });
  it('requires a target when creating a destination and forbids changing channel in place', async () => {
    const caller = appRouter.createCaller({ principal, store: fakeStore() });
    await expect(
      caller.destination.save({ kind: 'email', label: 'Email', enabled: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.destination.save({ id: destination.id, kind: 'email', label: 'Email', enabled: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('enforces the administrator boundary server-side', async () => {
    const store = fakeStore();
    const user = appRouter.createCaller({ principal, store });
    await expect(user.admin.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(user.admin.retry({ deliveryId: 'delivery-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(store.adminOverview).not.toHaveBeenCalled();
    const admin = appRouter.createCaller({ principal: { ...principal, role: 'admin' }, store });
    expect(await admin.admin.overview()).toMatchObject({ users: 1, feeds: 1 });
    expect(store.adminOverview).toHaveBeenCalledOnce();
  });
});
