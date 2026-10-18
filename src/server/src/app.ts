import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { ServerConfig } from './config.js';
import {
  authPage,
  escapeHtml,
  handoffMessage,
  resolveAuthLocale,
  scriptValue,
} from './auth-pages.js';
import { HandoffBroker, HandoffError } from './handoff.js';
import { principalFromSession, type AuthBoundary } from './identity.js';
import { appRouter, type ApplicationStore } from './router.js';

export interface ServerDependencies {
  readonly config: ServerConfig;
  readonly auth: AuthBoundary;
  readonly store: ApplicationStore;
  readonly handoffs?: HandoffBroker;
}

const exchangeInput = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    codeVerifier: z.string().min(43).max(128),
    redirectUri: z.string().url().max(200),
  })
  .strict();

export function createApp({
  config,
  auth,
  store,
  handoffs = new HandoffBroker(config.extensionRedirects),
}: ServerDependencies): Hono {
  const app = new Hono();
  app.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    context.header('Referrer-Policy', 'no-referrer');
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('X-Frame-Options', 'DENY');
    await next();
  });
  app.use(
    '*',
    bodyLimit({
      maxSize: 1_048_576,
      onError: (context) => {
        // A rejected unread body cannot safely share its HTTP/1 keepalive socket
        // with a later request. Tell clients before Node disposes of the stream.
        context.header('Connection', 'close');
        return context.json({ error: 'Request body is too large.' }, 413);
      },
    }),
  );
  app.use(
    '*',
    cors({
      origin: (origin) => (config.trustedOrigins.includes(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['set-auth-token'],
      maxAge: 600,
    }),
  );
  app.get('/healthz', (context) =>
    context.json({ status: 'ok', authentication: auth.configured ? 'configured' : 'unconfigured' }),
  );
  app.all('/api/auth/*', (context) => auth.handler(context.req.raw));
  app.get('/', (context) => {
    const locale = resolveAuthLocale(
      context.req.query('lang'),
      context.req.query('dir'),
      context.req.header('Accept-Language'),
    );
    return context.html(
      authPage(
        locale,
        locale.messages.server,
        `<p>${escapeHtml(locale.messages.serverIntro)}</p><p><a href="/healthz">${escapeHtml(locale.messages.health)}</a></p>`,
      ),
    );
  });

  app.get('/auth/start', (context) => {
    const locale = resolveAuthLocale(
      context.req.query('lang'),
      context.req.query('dir'),
      context.req.header('Accept-Language'),
    );
    const text = locale.messages;
    if (!auth.configured) {
      const requirements = config.authConfigurationIssues
        .map((issue) => `<li><bdi>${escapeHtml(issue)}</bdi></li>`)
        .join('');
      return context.html(
        authPage(
          locale,
          text.configuration,
          `<p>${escapeHtml(text.configurationIntro)}</p><ul>${requirements}</ul><p>${escapeHtml(text.callback)} <code>${escapeHtml(config.baseUrl)}/api/auth/callback/google</code>.</p><p>${escapeHtml(text.restart)}</p>`,
        ),
        503,
      );
    }
    try {
      const flowId = handoffs.begin({
        redirectUri: context.req.query('redirectUri') ?? '',
        state: context.req.query('state') ?? '',
        codeChallenge: context.req.query('codeChallenge') ?? '',
      });
      setCookie(context, 'signalpost_flow', flowId, {
        httpOnly: true,
        secure: config.baseUrl.startsWith('https:'),
        sameSite: 'Lax',
        path: '/auth',
        maxAge: 600,
      });
      const callbackURL = `${config.baseUrl}/auth/complete?flow=${flowId}&lang=${locale.language}&dir=${locale.direction}`;
      const nonce = randomBytes(18).toString('base64');
      context.header(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      );
      const script = `const button=document.querySelector('button');const status=document.getElementById('status');const messages={opening:${scriptValue(text.opening)},startError:${scriptValue(text.startError)},unexpected:${scriptValue(text.unexpected)},failed:${scriptValue(text.failed)}};async function signIn(){button.disabled=true;status.textContent=messages.opening;try{const response=await fetch('/api/auth/sign-in/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:${scriptValue(callbackURL)},disableRedirect:true})});const result=await response.json();if(!response.ok||typeof result.url!=='string')throw new Error(messages.startError);const destination=new URL(result.url);if(destination.origin!=='https://accounts.google.com')throw new Error(messages.unexpected);location.assign(destination.href);}catch(error){status.textContent=error instanceof Error&&[messages.startError,messages.unexpected].includes(error.message)?error.message:messages.failed;status.setAttribute('role','alert');button.disabled=false;}}button.addEventListener('click',signIn);void signIn();`;
      return context.html(
        authPage(
          locale,
          text.signIn,
          `<p>${escapeHtml(text.chooseAccount)}</p><p id="status" aria-live="polite">${escapeHtml(text.starting)}</p><button type="button">${escapeHtml(text.continue)}</button>`,
          script,
          nonce,
        ),
      );
    } catch (error) {
      if (error instanceof HandoffError)
        return context.html(
          authPage(
            locale,
            text.cannotStart,
            `<p role="alert">${escapeHtml(handoffMessage(locale, error.message))}</p>`,
          ),
          400,
        );
      throw error;
    }
  });

  app.get('/auth/complete', async (context) => {
    const locale = resolveAuthLocale(
      context.req.query('lang'),
      context.req.query('dir'),
      context.req.header('Accept-Language'),
    );
    const text = locale.messages;
    const flowId = context.req.query('flow') ?? '';
    const cookie = getCookie(context, 'signalpost_flow') ?? '';
    deleteCookie(context, 'signalpost_flow', { path: '/auth' });
    if (
      !/^[A-Za-z0-9_-]{43}$/u.test(flowId) ||
      !/^[A-Za-z0-9_-]{43}$/u.test(cookie) ||
      !timingSafeEqual(Buffer.from(flowId), Buffer.from(cookie))
    ) {
      return context.html(
        authPage(locale, text.expired, `<p>${escapeHtml(text.expiredHelp)}</p>`),
        400,
      );
    }
    const session = await auth.getSession(context.req.raw.headers);
    const principal = principalFromSession(session, config.adminEmails);
    if (session === null || principal === null)
      return context.html(
        authPage(locale, text.required, `<p>${escapeHtml(text.requiredHelp)}</p>`),
        401,
      );
    try {
      const redirect = handoffs.complete(flowId, {
        token: session.session.token,
        expiresAt: session.session.expiresAt.toISOString(),
        user: principal,
      });
      return context.redirect(redirect, 302);
    } catch (error) {
      if (error instanceof HandoffError)
        return context.html(
          authPage(locale, text.expired, `<p>${escapeHtml(text.expiredHelp)}</p>`),
          400,
        );
      throw error;
    }
  });

  app.post('/auth/exchange', async (context) => {
    const origin = context.req.header('Origin');
    if (origin !== undefined && !config.trustedOrigins.includes(origin))
      return context.json({ error: 'Origin is not allowed.' }, 403);
    const parsed = exchangeInput.safeParse(await context.req.json().catch(() => undefined));
    if (!parsed.success) return context.json({ error: 'Invalid sign-in exchange request.' }, 400);
    try {
      const result = handoffs.exchange(
        parsed.data.code,
        parsed.data.codeVerifier,
        parsed.data.redirectUri,
      );
      const session = await auth.getSession(
        new Headers({ Authorization: `Bearer ${result.token}` }),
      );
      if (principalFromSession(session, config.adminEmails) === null)
        return context.json({ error: 'Session expired. Sign in again.' }, 401);
      return context.json(result);
    } catch (error) {
      if (error instanceof HandoffError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.all('/trpc/*', async (context) => {
    const origin = context.req.header('Origin');
    if (origin !== undefined && !config.trustedOrigins.includes(origin))
      return context.json({ error: 'Origin is not allowed.' }, 403);
    return fetchRequestHandler({
      endpoint: '/trpc',
      maxBatchSize: 20,
      req: context.req.raw,
      router: appRouter,
      createContext: async () => ({
        principal: principalFromSession(
          await auth.getSession(context.req.raw.headers),
          config.adminEmails,
        ),
        store,
      }),
      onError: ({ path, error }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR')
          process.stderr.write(
            `${JSON.stringify({ event: 'rpc_failure', path, code: error.code })}\n`,
          );
      },
    });
  });
  app.onError((_error, context) => {
    process.stderr.write(
      `${JSON.stringify({ event: 'http_failure', path: new URL(context.req.url).pathname })}\n`,
    );
    return context.json({ error: 'The server could not complete this operation.' }, 500);
  });
  return app;
}
