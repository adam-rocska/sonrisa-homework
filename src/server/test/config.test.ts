import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

describe("configuration", () => {
  it("keeps a local server available without pretending authentication is configured", () => {
    const config = readConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.authConfigurationIssues).toHaveLength(4);
    expect(config.extensionRedirects).toEqual([]);
    expect(config.mailFrom).toBeUndefined();
  });
  it("pins callback destinations to exact configured extension IDs", () => {
    const config = readConfig({ EXTENSION_IDS: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    expect(config.extensionRedirects).toEqual(["https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/auth", "https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/auth"]);
  });
  it.each([
    { BETTER_AUTH_URL: "http://example.com" },
    { BETTER_AUTH_URL: "https://user:password@example.com" },
    { BETTER_AUTH_URL: "https://example.com/api" },
    { NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000" },
    { PORT: "3000oops" },
    { PORT: "0" },
    { EXTENSION_IDS: "*" },
    { EXTENSION_IDS: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz" },
    { BETTER_AUTH_SECRET: "short" },
    { MAIL_FROM: "person@example.com\r\nBcc: attacker@example.com" },
    { SENDMAIL_PATH: "sendmail;bad" },
    { POLL_INTERVAL_MS: "1" },
    { ADMIN_EMAILS: "not-an-email" },
  ])("rejects invalid configuration %j", (environment) => {
    expect(() => readConfig(environment)).toThrow();
  });
  it("normalizes admin addresses without allowing an arbitrary origin wildcard", () => {
    const config = readConfig({ ADMIN_EMAILS: "Boss@Example.com", BETTER_AUTH_URL: "https://example.com" });
    expect(config.adminEmails.has("boss@example.com")).toBe(true);
    expect(config.trustedOrigins).toEqual(["https://example.com"]);
  });
});
