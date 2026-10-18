import { describe, expect, it } from "vitest"
import { sameIdentity, type SyncIdentity } from "./sync-identity"
const identity: SyncIdentity = { userId: "u1", apiBaseUrl: "https://api.example.test", token: "session-a" }
describe("queued write principal binding", () => {
  it("rejects logout, server changes, user changes, and replaced sessions", () => {
    expect(sameIdentity(identity, null)).toBe(false)
    expect(sameIdentity(identity, { ...identity, userId: "u2" })).toBe(false)
    expect(sameIdentity(identity, { ...identity, apiBaseUrl: "https://other.example.test" })).toBe(false)
    expect(sameIdentity(identity, { ...identity, token: "session-b" })).toBe(false)
    expect(sameIdentity(identity, { ...identity })).toBe(true)
  })
})
