import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HandoffBroker, type HandoffSession } from "../src/handoff.js";

const redirectUri = "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/auth";
const codeVerifier = "v".repeat(64);
const state = "s".repeat(43);
const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
const session: HandoffSession = { token: "secret-session-token", expiresAt: "2030-01-01T00:00:00.000Z", user: { id: "user-1", email: "a@example.com", name: "User", role: "user" } };

function issued(broker: HandoffBroker): URL {
  return new URL(broker.complete(broker.begin({ redirectUri, codeChallenge, state }), session));
}
describe("PKCE session handoff", () => {
  it("returns only a one-use code and original state through the browser redirect", () => {
    const broker = new HandoffBroker([redirectUri], () => 1_000);
    const redirect = issued(broker);
    expect(redirect.searchParams.get("state")).toBe(state);
    expect(redirect.href).not.toContain(session.token);
    const code = redirect.searchParams.get("code") ?? "";
    expect(broker.exchange(code, codeVerifier, redirectUri)).toEqual(session);
    expect(() => broker.exchange(code, codeVerifier, redirectUri)).toThrow("Invalid or expired");
  });
  it("rejects attacker redirects and malformed challenges", () => {
    const broker = new HandoffBroker([redirectUri]);
    expect(() => broker.begin({ redirectUri: "https://attacker.example/auth", codeChallenge, state })).toThrow();
    expect(() => broker.begin({ redirectUri, codeChallenge: "plain-verifier", state })).toThrow();
    expect(() => broker.begin({ redirectUri, codeChallenge, state: "predictable" })).toThrow();
  });
  it("rejects wrong verifier and invalidates the intercepted code", () => {
    const broker = new HandoffBroker([redirectUri], () => 1_000);
    const code = issued(broker).searchParams.get("code") ?? "";
    expect(() => broker.exchange(code, "x".repeat(64), redirectUri)).toThrow("verification failed");
    expect(() => broker.exchange(code, codeVerifier, redirectUri)).toThrow("Invalid or expired");
  });
  it("binds the handoff to the exact extension redirect", () => {
    const broker = new HandoffBroker([redirectUri], () => 1_000);
    const code = issued(broker).searchParams.get("code") ?? "";
    expect(() => broker.exchange(code, codeVerifier, `${redirectUri}/elsewhere`)).toThrow("verification failed");
  });
  it("expires both unfinished logins and unexchanged codes", () => {
    let now = 0;
    const broker = new HandoffBroker([redirectUri], () => now);
    const flow = broker.begin({ redirectUri, codeChallenge, state });
    now = 600_001;
    expect(() => broker.complete(flow, session)).toThrow("expired");
    const code = issued(broker).searchParams.get("code") ?? "";
    now += 60_001;
    expect(() => broker.exchange(code, codeVerifier, redirectUri)).toThrow("expired");
  });
  it("does not complete the same OAuth flow twice", () => {
    const broker = new HandoffBroker([redirectUri], () => 1_000);
    const flow = broker.begin({ redirectUri, codeChallenge, state });
    broker.complete(flow, session);
    expect(() => broker.complete(flow, session)).toThrow("already been completed");
  });
});
