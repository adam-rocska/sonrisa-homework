import * as z from 'zod/v3';
export const inspectionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    snapshot: z.object({
      sourceId: z.string().regex(/^\d+$/),
      feeds: z.array(z.object({ feedUrl: z.string().url(), query: z.string().min(1) })).max(1000),
    }),
    emailOnlyCount: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal('signed-out') }),
  z.object({ status: z.literal('unavailable'), reason: z.string() }),
]);
export const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('signalpost:context') }),
  z.object({ type: z.literal('signalpost:snapshot'), inspection: inspectionSchema }),
  z.object({ type: z.literal('signalpost:sync') }),
  z.object({ type: z.literal('signalpost:open') }),
]);
export const contextSchema = z.object({
  autoSync: z.boolean(),
  boundSourceId: z.string().optional(),
});
export const resultSchema = z.object({ ok: z.boolean(), message: z.string() });
export type ActionResult = z.infer<typeof resultSchema>;
export function isAlertsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://www.google.com' &&
      (url.pathname === '/alerts' || url.pathname.startsWith('/alerts/'))
    );
  } catch {
    return false;
  }
}
