import * as z from 'zod/v3';

const settingsSchema = z.object({ apiBaseUrl: z.string().url(), autoSync: z.boolean() });
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = { apiBaseUrl: 'http://localhost:3000', autoSync: true };
export const authExchangeSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(['user', 'admin']),
  }),
});
export const authSchema = authExchangeSchema.extend({ apiBaseUrl: z.string().url() });
export type AuthSession = z.infer<typeof authSchema>;
export const syncStatusSchema = z.object({
  state: z.enum(['idle', 'syncing', 'success', 'error']),
  message: z.string(),
  messageKey: z.string().optional(),
  messageParams: z.record(z.union([z.string(), z.number()])).optional(),
  emailOnlyCount: z.number().int().nonnegative().optional(),
  at: z.string(),
  feedCount: z.number().int().nonnegative().optional(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Use a server origin, without a path or credentials.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error('Use HTTPS, or HTTP for a local development server.');
  return url.origin;
}
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings');
  const parsed = settingsSchema.safeParse(result['settings']);
  return parsed.success ? parsed.data : defaultSettings;
}
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    settings: { ...settings, apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl) },
  });
}
export async function getSession(): Promise<AuthSession | null> {
  const result = await chrome.storage.session.get('auth');
  const parsed = authSchema.safeParse(result['auth']);
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) return null;
  if (parsed.data.apiBaseUrl !== (await getSettings()).apiBaseUrl) return null;
  return parsed.data;
}
export async function setSession(session: AuthSession | null): Promise<void> {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (session) await chrome.storage.session.set({ auth: session });
  else await chrome.storage.session.remove('auth');
}
export async function getBinding(): Promise<string | undefined> {
  const session = await getSession();
  if (!session) return undefined;
  const key = `binding:${session.apiBaseUrl}:${session.user.id}`;
  const result = await chrome.storage.local.get(key);
  return typeof result[key] === 'string' ? result[key] : undefined;
}
export async function setBinding(sourceId: string, capturedSession?: AuthSession): Promise<void> {
  const session = capturedSession ?? (await getSession());
  if (!session) throw new Error('Sign in to Signalpost first.');
  await chrome.storage.local.set({
    [`binding:${session.apiBaseUrl}:${session.user.id}`]: sourceId,
  });
}
export async function setSyncStatus(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({ syncStatus: status });
}
export async function getSyncStatus(): Promise<SyncStatus | null> {
  const result = await chrome.storage.local.get('syncStatus');
  const parsed = syncStatusSchema.safeParse(result['syncStatus']);
  return parsed.success ? parsed.data : null;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation failed. Please try again.';
}
