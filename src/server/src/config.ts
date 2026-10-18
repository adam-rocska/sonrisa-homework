import { resolve } from "node:path";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly authSecret: string | undefined;
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly extensionIds: readonly string[];
  readonly trustedOrigins: readonly string[];
  readonly extensionRedirects: readonly string[];
  readonly adminEmails: ReadonlySet<string>;
  readonly dataDirectory: string;
  readonly sendmailPath: string;
  readonly mailFrom: string | undefined;
  readonly pollIntervalMs: number;
  readonly authConfigurationIssues: readonly string[];
}

function value(env: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const result = env[name]?.trim();
  return result === "" ? undefined : result;
}

function integer(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/u.test(raw)) throw new Error(`${name} must be an integer.`);
  const result = Number(raw);
  if (result < min || result > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return result;
}

export function readConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig {
  const port = integer(value(env, "PORT"), 3000, 1, 65535, "PORT");
  const base = new URL(value(env, "BETTER_AUTH_URL") ?? `http://localhost:${port}`);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username !== "" || base.password !== "" || base.pathname !== "/" || base.search !== "" || base.hash !== "") {
    throw new Error("BETTER_AUTH_URL must be an origin without credentials, path, query or fragment.");
  }
  if (base.protocol !== "https:" && !(base.protocol === "http:" && isLoopback)) {
    throw new Error("BETTER_AUTH_URL requires HTTPS except on loopback during development.");
  }
  if (env["NODE_ENV"] === "production" && base.protocol !== "https:") {
    throw new Error("Production BETTER_AUTH_URL requires HTTPS.");
  }
  const extensionIds = [...new Set((value(env, "EXTENSION_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (extensionIds.some((id) => !/^[a-p]{32}$/u.test(id))) {
    throw new Error("EXTENSION_IDS must contain exact 32-letter Chrome extension IDs, separated by commas.");
  }
  const authSecret = value(env, "BETTER_AUTH_SECRET");
  if (authSecret !== undefined && authSecret.length < 32) throw new Error("BETTER_AUTH_SECRET must have at least 32 characters.");
  const googleClientId = value(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = value(env, "GOOGLE_CLIENT_SECRET");
  const authConfigurationIssues: string[] = [];
  if (authSecret === undefined) authConfigurationIssues.push("Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.");
  if (googleClientId === undefined) authConfigurationIssues.push("Set GOOGLE_CLIENT_ID from a Google Web application OAuth client.");
  if (googleClientSecret === undefined) authConfigurationIssues.push("Set GOOGLE_CLIENT_SECRET for that OAuth client.");
  if (extensionIds.length === 0) authConfigurationIssues.push("Set EXTENSION_IDS to the installed extension ID.");
  const adminEmails = new Set((value(env, "ADMIN_EMAILS") ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  if ([...adminEmails].some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))) throw new Error("ADMIN_EMAILS contains an invalid address.");
  const mailFrom = value(env, "MAIL_FROM");
  if (mailFrom !== undefined && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(mailFrom)) throw new Error("MAIL_FROM must be one plain email address without control characters.");
  const sendmailPath = value(env, "SENDMAIL_PATH") ?? "/usr/sbin/sendmail";
  if (!sendmailPath.startsWith("/") || /[\r\n\0]/u.test(sendmailPath)) throw new Error("SENDMAIL_PATH must be an absolute executable path.");
  return {
    host: value(env, "HOST") ?? "127.0.0.1",
    port,
    baseUrl: base.origin,
    authSecret,
    googleClientId,
    googleClientSecret,
    extensionIds,
    trustedOrigins: [base.origin, ...extensionIds.map((id) => `chrome-extension://${id}`)],
    extensionRedirects: extensionIds.map((id) => `https://${id}.chromiumapp.org/auth`),
    adminEmails,
    dataDirectory: resolve(value(env, "DATA_DIRECTORY") ?? "var/lib/signalpost"),
    sendmailPath,
    mailFrom,
    pollIntervalMs: integer(value(env, "POLL_INTERVAL_MS"), 60_000, 10_000, 3_600_000, "POLL_INTERVAL_MS"),
    authConfigurationIssues,
  };
}
