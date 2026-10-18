import type {
  AdminOverviewDto,
  CatalogDto,
  DeliveryDto,
  DestinationDto,
  UserDto,
} from '@signalpost/contracts';

export interface Viewer {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly isAdmin: boolean;
}
export interface Destination {
  readonly id: string;
  readonly label: string;
  readonly channel: 'email' | 'slack';
  readonly isEnabled: boolean;
}
export interface Feed {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly isEnabled: boolean;
  readonly routes: readonly string[];
  readonly lastChecked: string;
  readonly nextCheck: string;
  readonly issue: string | null;
}
export interface Delivery {
  readonly id: string;
  readonly title: string;
  readonly href: string | null;
  readonly feedLabel: string;
  readonly destinationLabel: string;
  readonly status: 'pending' | 'accepted' | 'failed' | 'cancelled';
  readonly attempts: number;
  readonly happenedAt: string;
  readonly issue: string | null;
}
export interface Catalog {
  readonly sourceId: string | null;
  readonly syncedAt: string;
  readonly feeds: readonly Feed[];
}
export interface AdminOverview {
  readonly userCount: number;
  readonly feedCount: number;
  readonly destinationCount: number;
  readonly pendingCount: number;
  readonly failedCount: number;
  readonly acceptedCount: number;
  readonly deliveries: readonly Delivery[];
}
export function timeLabel(value: string | null): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}
export function mapViewer(dto: UserDto): Viewer {
  return {
    id: dto.id,
    displayName: dto.name || dto.email,
    email: dto.email,
    isAdmin: dto.role === 'admin',
  };
}
export function mapDestination(dto: DestinationDto): Destination {
  return { id: dto.id, label: dto.label, channel: dto.kind, isEnabled: dto.enabled };
}
export function mapCatalog(dto: CatalogDto): Catalog {
  return {
    sourceId: dto.sourceId,
    syncedAt: timeLabel(dto.lastSyncedAt),
    feeds: dto.feeds.map((feed) => ({
      id: feed.id,
      label: feed.query,
      address: feed.feedUrl,
      isEnabled: feed.enabled,
      routes: [...feed.destinationIds],
      lastChecked: timeLabel(feed.lastFetchedAt),
      nextCheck: timeLabel(feed.nextPollAt),
      issue: feed.lastError,
    })),
  };
}
function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function mapDelivery(
  dto: DeliveryDto,
  catalog: Catalog,
  destinations: readonly Destination[],
): Delivery {
  return {
    id: dto.id,
    title: dto.title,
    href: safeLink(dto.itemUrl),
    feedLabel:
      catalog.feeds.find((feed) => feed.id === dto.feedId)?.label ?? "Removed or other user's feed",
    destinationLabel:
      destinations.find((target) => target.id === dto.destinationId)?.label ??
      "Removed or other user's destination",
    status: dto.state,
    attempts: dto.attempts,
    happenedAt: timeLabel(dto.acceptedAt ?? dto.updatedAt),
    issue: dto.lastError,
  };
}
export function mapAdmin(
  dto: AdminOverviewDto,
  catalog: Catalog,
  destinations: readonly Destination[],
): AdminOverview {
  return {
    userCount: dto.users,
    feedCount: dto.feeds,
    destinationCount: dto.destinations,
    pendingCount: dto.pending,
    failedCount: dto.failed,
    acceptedCount: dto.accepted,
    deliveries: dto.recentDeliveries.map((delivery) =>
      mapDelivery(delivery, catalog, destinations),
    ),
  };
}
