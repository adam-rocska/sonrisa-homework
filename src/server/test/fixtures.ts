import { vi } from "vitest";
import type { Catalog, Destination, Feed } from "@signalpost/core";
import type { Principal, SessionIdentity } from "../src/identity.js";
import type { ApplicationStore } from "../src/router.js";

export const timestamp = new Date("2026-10-18T18:00:00.000Z");
export const principal: Principal = { id: "user-1", email: "user@example.com", name: "User", role: "user" };
export const session: SessionIdentity = { session: { token: "private-token", expiresAt: new Date("2030-01-01") }, user: { id: principal.id, email: principal.email, name: principal.name, emailVerified: true } };
export const feed: Feed = { id: "feed-1", userId: "user-1", sourceId: "123", url: "https://www.google.com/alerts/feeds/123/456", query: "breaking news", enabled: true, destinationIds: [], lastFetchedAt: null, nextPollAt: timestamp, baselineAt: null, lastError: null, createdAt: timestamp, updatedAt: timestamp };
export const catalog: Catalog = { sourceId: "123", lastSyncedAt: timestamp, feeds: [feed] };
export const destination: Destination = { id: "destination-1", userId: "user-1", kind: "slack", label: "News", enabled: true, createdAt: timestamp, updatedAt: timestamp };

function absent(): never { throw new Error("Unexpected store operation"); }
export function fakeStore(): ApplicationStore {
  return {
    getCatalog: vi.fn(() => catalog),
    replaceCatalog: vi.fn(() => catalog),
    configureFeed: vi.fn(() => feed),
    listDestinations: vi.fn(() => [destination]),
    createDestination: vi.fn(() => destination),
    updateDestination: vi.fn(() => destination),
    removeDestination: vi.fn(() => undefined),
    listDeliveries: vi.fn(() => []),
    adminOverview: vi.fn(() => ({ users: 1, feeds: 1, destinations: 1, pending: 0, failed: 0, accepted: 0, recentDeliveries: [] })),
    retryDelivery: vi.fn(absent),
  };
}
