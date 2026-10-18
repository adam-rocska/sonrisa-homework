import { createHash, webcrypto } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { signIn, signOut } from "./auth"
import { getSession, normalizeApiBaseUrl } from "./storage"

const callback = "https://extension-id.chromiumapp.org/auth"
const session = { token: "private-session", expiresAt: "2099-01-01T00:00:00.000Z", user: { id: "user-1", email: "test@example.test", name: "Tester", role: "user" } }
let local: Record<string, unknown>
let memory: Record<string, unknown>
let launch: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>
let access: ReturnType<typeof vi.fn>
let startUrl: URL | undefined

beforeEach(() => {
  local = { settings: { apiBaseUrl: "http://localhost:3000", autoSync: true } }
  memory = {}; startUrl = undefined; access = vi.fn().mockResolvedValue(undefined)
  launch = vi.fn(async ({ url }: { url: string }) => {
    startUrl = new URL(url)
    return `${callback}?code=one-use-code&state=${startUrl.searchParams.get("state")}`
  })
  fetchMock = vi.fn(async () => new Response(JSON.stringify(session), { status: 200 }))
  vi.stubGlobal("crypto", webcrypto)
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("chrome", {
    identity: { getRedirectURL: vi.fn(() => callback), launchWebAuthFlow: launch },
    storage: {
      local: { get: async (key: string) => ({ [key]: local[key] }), set: async (values: Record<string, unknown>) => { Object.assign(local, values) } },
      session: { get: async (key: string) => ({ [key]: memory[key] }), set: async (values: Record<string, unknown>) => { Object.assign(memory, values) }, remove: async (key: string) => { delete memory[key] }, setAccessLevel: access }
    }
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe("Google sign-in handoff", () => {
  it("uses S256 PKCE, verifies state, and keeps bearer credentials in trusted session storage", async () => {
    await expect(signIn()).resolves.toEqual({ ...session, apiBaseUrl: "http://localhost:3000" })
    expect(startUrl?.origin).toBe("http://localhost:3000")
    expect(startUrl?.pathname).toBe("/auth/start")
    const call = fetchMock.mock.calls[0]
    const init = call?.[1] as RequestInit | undefined
    const body = JSON.parse(String(init?.body)) as { code: string; codeVerifier: string; redirectUri: string }
    expect(body.code).toBe("one-use-code"); expect(body.redirectUri).toBe(callback)
    expect(createHash("sha256").update(body.codeVerifier).digest("base64url")).toBe(startUrl?.searchParams.get("codeChallenge"))
    expect(startUrl?.searchParams.has("codeVerifier")).toBe(false)
    expect(access).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" })
    expect(memory["auth"]).toEqual({ ...session, apiBaseUrl: "http://localhost:3000" })
    expect(JSON.stringify(local)).not.toContain(session.token)
  })
  it.each([
    `${callback}?code=stolen&state=wrong`,
    "https://evil.example/auth?code=stolen&state=correct",
    "https://extension-id.chromiumapp.org/other?code=stolen&state=correct"
  ])("rejects altered state or callback destination before exchange", async invalid => {
    launch.mockImplementation(async ({ url }: { url: string }) => invalid.replace("correct", new URL(url).searchParams.get("state") ?? ""))
    await expect(signIn()).rejects.toThrow("callback could not be verified")
    expect(fetchMock).not.toHaveBeenCalled(); expect(memory["auth"]).toBeUndefined()
  })
  it("does not save malformed exchange responses or accept expired sessions", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: "missing-user" }), { status: 200 }))
    await expect(signIn()).rejects.toThrow(); expect(memory["auth"]).toBeUndefined()
    memory["auth"] = { ...session, apiBaseUrl: "http://localhost:3000", expiresAt: "2000-01-01T00:00:00.000Z" }
    await expect(getSession()).resolves.toBeNull()
  })
  it("rejects OAuth completion if another window changed the server", async () => {
    fetchMock.mockImplementation(async () => {
      local["settings"] = { apiBaseUrl: "https://server-b.example.test", autoSync: true }
      return new Response(JSON.stringify(session), { status: 200 })
    })
    await expect(signIn()).rejects.toThrow("server changed while signing in")
    expect(memory["auth"]).toBeUndefined()
  })
  it("never returns a server-A credential while server B is selected", async () => {
    memory["auth"] = { ...session, apiBaseUrl: "http://localhost:3000" }
    local["settings"] = { apiBaseUrl: "https://server-b.example.test", autoSync: true }
    await expect(getSession()).resolves.toBeNull()
  })
  it("clears the local trusted session even when remote logout fails", async () => {
    memory["auth"] = { ...session, apiBaseUrl: "http://localhost:3000" }
    fetchMock.mockResolvedValue(new Response("offline", { status: 503 }))
    await expect(signOut()).rejects.toThrow("local session was cleared")
    expect(memory["auth"]).toBeUndefined()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${session.token}` })
  })
})
describe("server origin policy", () => {
  it("allows local HTTP and remote HTTPS, but no credentials, URL paths or remote HTTP", () => {
    expect(normalizeApiBaseUrl("http://localhost:3000/")).toBe("http://localhost:3000")
    expect(normalizeApiBaseUrl("https://api.example.test")).toBe("https://api.example.test")
    for (const value of ["http://remote.example", "https://user:pass@example.test", "https://api.example.test/path", "https://api.example.test/?token=secret"]) expect(() => normalizeApiBaseUrl(value)).toThrow()
  })
})
