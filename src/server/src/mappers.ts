import type { AdminOverview, Catalog, Delivery, Destination, Feed } from '@signalpost/core';

export function feedToDto(feed: Feed) {
  return {
    id: feed.id,
    sourceId: feed.sourceId,
    feedUrl: feed.url,
    query: feed.query,
    enabled: feed.enabled,
    destinationIds: [...feed.destinationIds],
    lastFetchedAt: feed.lastFetchedAt?.toISOString() ?? null,
    nextPollAt: feed.nextPollAt.toISOString(),
    baselineAt: feed.baselineAt?.toISOString() ?? null,
    lastError: feed.lastError,
    createdAt: feed.createdAt.toISOString(),
    updatedAt: feed.updatedAt.toISOString(),
  };
}

export function catalogToDto(catalog: Catalog) {
  return {
    sourceId: catalog.sourceId,
    lastSyncedAt: catalog.lastSyncedAt?.toISOString() ?? null,
    feeds: catalog.feeds.map(feedToDto),
  };
}

export function destinationToDto(destination: Destination) {
  return {
    id: destination.id,
    kind: destination.kind,
    label: destination.label,
    enabled: destination.enabled,
    createdAt: destination.createdAt.toISOString(),
    updatedAt: destination.updatedAt.toISOString(),
  };
}

export function deliveryToDto(delivery: Delivery) {
  return {
    id: delivery.id,
    feedId: delivery.feedId,
    destinationId: delivery.destinationId,
    title: delivery.title,
    itemUrl: delivery.url,
    state: delivery.state,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt.toISOString(),
    acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
    lastError: delivery.lastError,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}

export function overviewToDto(overview: AdminOverview) {
  return {
    users: overview.users,
    feeds: overview.feeds,
    destinations: overview.destinations,
    pending: overview.pending,
    failed: overview.failed,
    accepted: overview.accepted,
    recentDeliveries: overview.recentDeliveries.map(deliveryToDto),
  };
}
