import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createGoogleAuth } from "../src/auth.js";
import { readConfig } from "../src/config.js";

describe("real Better Auth adapter boundary", () => {
  it("stays disabled when credentials are absent", async () => {
    const auth = await createGoogleAuth(readConfig({}));
    expect(auth.configured).toBe(false);
    expect(await auth.getSession(new Headers())).toBeNull();
    expect((await auth.handler(new Request("http://localhost:3000/api/auth/get-session"))).status).toBe(503);
    auth.close();
  });
  it("migrates SQLite and accepts the raw session bearer emitted by the extension handoff", async () => {
    const directory = mkdtempSync(join(tmpdir(), "signalpost-auth-test-"));
    const config = readConfig({ DATA_DIRECTORY: directory, BETTER_AUTH_SECRET: "test-only-secret-do-not-use-in-production-12345", GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only-google-secret", EXTENSION_IDS: "a".repeat(32) });
    const auth = await createGoogleAuth(config);
    try {
      expect(auth.configured).toBe(true);
      const anonymous = await auth.handler(new Request("http://localhost:3000/api/auth/get-session"));
      expect(anonymous.status).toBe(200);
      expect(await anonymous.json()).toBeNull();
      const database = new Database(join(directory, "auth.sqlite"));
      try {
        const now = Date.now();
        database.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run("test-user", "Test User", "test@example.com", 1, now, now);
        database.prepare('INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)').run("test-session", now + 3_600_000, "test-session-bearer", now, now, "test-user");
      } finally { database.close(); }
      const session = await auth.getSession(new Headers({ Authorization: "Bearer test-session-bearer" }));
      expect(session?.user.email).toBe("test@example.com");
      expect(session?.user.emailVerified).toBe(true);
      expect(session?.session.token).toBe("test-session-bearer");
      expect(session?.session.expiresAt).toBeInstanceOf(Date);
      expect(await auth.getSession(new Headers({ Authorization: "Bearer invalid-token" }))).toBeNull();
      const signOut = await auth.handler(new Request("http://localhost:3000/api/auth/sign-out", { method: "POST", headers: { Origin: `chrome-extension://${"a".repeat(32)}`, Authorization: "Bearer test-session-bearer", "Content-Type": "application/json" }, body: "{}" }));
      expect(signOut.status).toBe(200);
      expect(await auth.getSession(new Headers({ Authorization: "Bearer test-session-bearer" }))).toBeNull();
    } finally {
      auth.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
