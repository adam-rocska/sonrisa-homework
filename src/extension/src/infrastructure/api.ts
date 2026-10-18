import { createTRPCProxyClient, httpBatchLink } from "@trpc/client"
import type { AppRouter } from "@signalpost/server/router"
import { getSession, getSettings } from "./storage"
import { fetchWithDeadline } from "./fetch-deadline"

/** Freeze credentials with the request client; a later login must never retarget an old write. */
export function createApiFor(apiBaseUrl: string, token: string | null) {
  return createTRPCProxyClient<AppRouter>({ links: [httpBatchLink({
    url: `${apiBaseUrl}/trpc`,
    fetch: (input, init) => fetchWithDeadline(input, { ...init, signal: init?.signal ?? null }),
    headers: () => token ? { Authorization: `Bearer ${token}` } : {}
  })] })
}
export async function createApi() {
  const [settings, session] = await Promise.all([getSettings(), getSession()])
  return createApiFor(settings.apiBaseUrl, session?.apiBaseUrl === settings.apiBaseUrl ? session.token : null)
}
export type SignalpostApi = Awaited<ReturnType<typeof createApi>>
