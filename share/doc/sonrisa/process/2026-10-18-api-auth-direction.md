# Server API and authentication direction

Date: 2026-10-18. Status: technical baseline selected;
awaiting the owner's product specification before implementation.

- The backend is a server-side service, separate from the browser.
- The extension is the product UI and communicates with that service
  through an API. It does not host the backend.
- The owner selected TypeScript for the server and retained SQLite.
- The owner delegated the gRPC/tRPC choice. Select tRPC for a TypeScript
  client and server with shared inferred API types and no separate code
  generation step. This choice does not settle the server runtime,
  HTTP framework or UI framework.
- Use Better Auth with Google OAuth/OIDC initially. Better Auth owns
  server-side authentication/session handling, with the extension using
  its supported client flow. Additional authentication providers can be
  added later; they are not part of the current implementation scope.
- Better Auth is the intended library in the owner's reference to the
  Auth.js successor. Auth.js joined Better Auth; this is not merely a
  package rename.
- The precise extension callback/session transport will be validated
  during implementation. Google sign-in identifies the product user;
  it does not grant Google Alerts management access.

Primary sources checked:

- [tRPC overview](https://trpc.io/docs)
- [Auth.js joins Better Auth](https://better-auth.com/blog/authjs-joins-better-auth)
- [Better Auth OAuth providers](https://better-auth.com/docs/concepts/oauth)

No product behaviors beyond the existing decisions were specified and no
application code was started. The owner will supply the product concept
and operating rules next.
