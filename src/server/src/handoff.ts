import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Principal } from "./identity.js";

export interface AuthorizationFlow {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
}

export interface HandoffSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: Principal;
}

interface Timed<T> { readonly value: T; readonly expires: number }
interface PendingCode extends AuthorizationFlow { readonly session: HandoffSession }

export class HandoffError extends Error {}

/** One server process by design. Restart safely invalidates unfinished logins. */
export class HandoffBroker {
  private readonly flows = new Map<string, Timed<AuthorizationFlow>>();
  private readonly codes = new Map<string, Timed<PendingCode>>();

  constructor(private readonly redirects: readonly string[], private readonly now: () => number = Date.now) {}

  begin(flow: AuthorizationFlow): string {
    this.prune();
    if (!this.redirects.includes(flow.redirectUri)) throw new HandoffError("The extension redirect is not configured on the server.");
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(flow.state)) throw new HandoffError("Invalid authentication state.");
    if (!/^[A-Za-z0-9_-]{43}$/u.test(flow.codeChallenge)) throw new HandoffError("A SHA-256 PKCE code challenge is required.");
    if (this.flows.size + this.codes.size >= 1_000) throw new HandoffError("Too many unfinished sign-ins. Try again later.");
    const id = randomBytes(32).toString("base64url");
    this.flows.set(id, { value: flow, expires: this.now() + 10 * 60_000 });
    return id;
  }

  complete(flowId: string, session: HandoffSession): string {
    this.prune();
    const pending = this.flows.get(flowId);
    if (pending === undefined) throw new HandoffError("The sign-in expired or has already been completed. Start again from the extension.");
    this.flows.delete(flowId);
    const code = randomBytes(32).toString("base64url");
    this.codes.set(code, { value: { ...pending.value, session }, expires: this.now() + 60_000 });
    const redirect = new URL(pending.value.redirectUri);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", pending.value.state);
    return redirect.href;
  }

  exchange(code: string, codeVerifier: string, redirectUri: string): HandoffSession {
    this.prune();
    const pending = this.codes.get(code);
    if (pending === undefined) throw new HandoffError("Invalid or expired sign-in code. Start again from the extension.");
    this.codes.delete(code);
    if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(codeVerifier)) throw new HandoffError("Invalid PKCE verifier.");
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const expected = Buffer.from(pending.value.codeChallenge);
    const received = Buffer.from(challenge);
    if (redirectUri !== pending.value.redirectUri || expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new HandoffError("Sign-in verification failed. Start again from the extension.");
    }
    if (new Date(pending.value.session.expiresAt).getTime() <= this.now()) throw new HandoffError("Session expired. Sign in again.");
    return pending.value.session;
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.flows) if (entry.expires <= now) this.flows.delete(key);
    for (const [key, entry] of this.codes) if (entry.expires <= now) this.codes.delete(key);
  }
}
