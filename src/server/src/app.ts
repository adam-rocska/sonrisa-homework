import { randomBytes, timingSafeEqual } from "node:crypto";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { HandoffBroker, HandoffError } from "./handoff.js";
import { principalFromSession, type AuthBoundary } from "./identity.js";
import { appRouter, type ApplicationStore } from "./router.js";

export interface ServerDependencies {
  readonly config: ServerConfig;
  readonly auth: AuthBoundary;
  readonly store: ApplicationStore;
  readonly handoffs?: HandoffBroker;
}

const exchangeInput = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().url().max(200),
}).strict();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function page(title: string, body: string, script = "", nonce = ""): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Signalpost</title><style>body{font:18px/1.6 system-ui;max-width:38rem;margin:10vh auto;padding:1.5rem;background:#fafaf9;color:#17201b}h1{line-height:1.2}button{font:inherit;padding:.75rem 1rem;border:2px solid #173d2a;border-radius:.5rem;background:#173d2a;color:white;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #dc6900;outline-offset:4px}code{overflow-wrap:anywhere}p[role=alert]{color:#8b1c11}</style><main><h1>${escapeHtml(title)}</h1>${body}</main>${script === "" ? "" : `<script nonce="${nonce}">${script}</script>`}</html>`;
}

export function createApp({ config, auth, store, handoffs = new HandoffBroker(config.extensionRedirects) }: ServerDependencies): Hono {
  const app = new Hono();
  app.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 1_048_576, onError: (context) => context.json({ error: "Request body is too large." }, 413) }));
  app.use("*", cors({
    origin: (origin) => config.trustedOrigins.includes(origin) ? origin : undefined,
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["set-auth-token"],
    maxAge: 600,
  }));
  app.get("/healthz", (context) => context.json({ status: "ok", authentication: auth.configured ? "configured" : "unconfigured" }));
  app.all("/api/auth/*", (context) => auth.handler(context.req.raw));
  app.get("/", (context) => context.html(page("Signalpost server", "<p>This server serves the Signalpost browser extension. Open the extension to sign in and manage your alerts.</p><p><a href=\"/healthz\">Server health</a></p>")));

  app.get("/auth/start", (context) => {
    if (!auth.configured) {
      const requirements = config.authConfigurationIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("");
      return context.html(page("Google sign-in needs configuration", `<p>The server is running, but Google authentication has not been configured.</p><ul>${requirements}</ul><p>Register this callback in your Google Web application client: <code>${escapeHtml(config.baseUrl)}/api/auth/callback/google</code>.</p><p>After configuration, restart the server and sign in from the extension again.</p>`), 503);
    }
    try {
      const flowId = handoffs.begin({
        redirectUri: context.req.query("redirectUri") ?? "",
        state: context.req.query("state") ?? "",
        codeChallenge: context.req.query("codeChallenge") ?? "",
      });
      setCookie(context, "signalpost_flow", flowId, { httpOnly: true, secure: config.baseUrl.startsWith("https:"), sameSite: "Lax", path: "/auth", maxAge: 600 });
      const callbackURL = `${config.baseUrl}/auth/complete?flow=${flowId}`;
      const nonce = randomBytes(18).toString("base64");
      context.header("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
      const script = `const button=document.querySelector('button');const status=document.getElementById('status');async function signIn(){button.disabled=true;status.textContent='Opening Google sign-in…';try{const response=await fetch('/api/auth/sign-in/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:${JSON.stringify(callbackURL)},disableRedirect:true})});const result=await response.json();if(!response.ok||typeof result.url!=='string')throw new Error('Google sign-in could not start. Check the server OAuth configuration.');const destination=new URL(result.url);if(destination.origin!=='https://accounts.google.com')throw new Error('Unexpected authentication destination.');location.assign(destination.href);}catch(error){status.textContent=error instanceof Error?error.message:'Sign-in failed.';status.setAttribute('role','alert');button.disabled=false;}}button.addEventListener('click',signIn);void signIn();`;
      return context.html(page("Sign in to Signalpost", "<p>Google will ask which account you want to use. Choose the account whose alerts you will synchronize.</p><p id=\"status\" aria-live=\"polite\">Starting sign-in…</p><button type=\"button\">Continue with Google</button>", script, nonce));
    } catch (error) {
      if (error instanceof HandoffError) return context.html(page("Sign-in could not start", `<p role="alert">${escapeHtml(error.message)}</p>`), 400);
      throw error;
    }
  });

  app.get("/auth/complete", async (context) => {
    const flowId = context.req.query("flow") ?? "";
    const cookie = getCookie(context, "signalpost_flow") ?? "";
    deleteCookie(context, "signalpost_flow", { path: "/auth" });
    if (!/^[A-Za-z0-9_-]{43}$/u.test(flowId) || !/^[A-Za-z0-9_-]{43}$/u.test(cookie) || !timingSafeEqual(Buffer.from(flowId), Buffer.from(cookie))) {
      return context.html(page("Sign-in expired", "<p>Start sign-in again from the extension. The browser could not verify the original sign-in request.</p>"), 400);
    }
    const session = await auth.getSession(context.req.raw.headers);
    const principal = principalFromSession(session, config.adminEmails);
    if (session === null || principal === null) return context.html(page("Google sign-in required", "<p>Sign in again with a verified Google email address from the extension.</p>"), 401);
    try {
      const redirect = handoffs.complete(flowId, { token: session.session.token, expiresAt: session.session.expiresAt.toISOString(), user: principal });
      return context.redirect(redirect, 302);
    } catch (error) {
      if (error instanceof HandoffError) return context.html(page("Sign-in expired", `<p>${escapeHtml(error.message)}</p>`), 400);
      throw error;
    }
  });

  app.post("/auth/exchange", async (context) => {
    const origin = context.req.header("Origin");
    if (origin !== undefined && !config.trustedOrigins.includes(origin)) return context.json({ error: "Origin is not allowed." }, 403);
    const parsed = exchangeInput.safeParse(await context.req.json().catch(() => undefined));
    if (!parsed.success) return context.json({ error: "Invalid sign-in exchange request." }, 400);
    try {
      const result = handoffs.exchange(parsed.data.code, parsed.data.codeVerifier, parsed.data.redirectUri);
      const session = await auth.getSession(new Headers({ Authorization: `Bearer ${result.token}` }));
      if (principalFromSession(session, config.adminEmails) === null) return context.json({ error: "Session expired. Sign in again." }, 401);
      return context.json(result);
    } catch (error) {
      if (error instanceof HandoffError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.all("/trpc/*", async (context) => {
    const origin = context.req.header("Origin");
    if (origin !== undefined && !config.trustedOrigins.includes(origin)) return context.json({ error: "Origin is not allowed." }, 403);
    return fetchRequestHandler({
      endpoint: "/trpc",
      req: context.req.raw,
      router: appRouter,
      createContext: async () => ({ principal: principalFromSession(await auth.getSession(context.req.raw.headers), config.adminEmails), store }),
      onError: ({ path, error }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") process.stderr.write(`${JSON.stringify({ event: "rpc_failure", path, code: error.code })}\n`);
      },
    });
  });
  app.onError((_error, context) => {
    process.stderr.write(`${JSON.stringify({ event: "http_failure", path: new URL(context.req.url).pathname })}\n`);
    return context.json({ error: "The server could not complete this operation." }, 500);
  });
  return app;
}
