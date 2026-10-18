/** A queued write belongs to one authenticated session on one server. */
export interface SyncIdentity {
  readonly userId: string;
  readonly apiBaseUrl: string;
  readonly token: string;
}
export function sameIdentity(expected: SyncIdentity, actual: SyncIdentity | null): boolean {
  return (
    actual !== null &&
    expected.userId === actual.userId &&
    expected.apiBaseUrl === actual.apiBaseUrl &&
    expected.token === actual.token
  );
}
