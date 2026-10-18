import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithDeadline } from './fetch-deadline';
const stalledFetch: typeof fetch = async (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
afterEach(() => {
  vi.useRealTimers();
});
describe('bounded API requests', () => {
  it('terminates a stalled request on a deterministic deadline and clears its timer', async () => {
    vi.useFakeTimers();
    const request = fetchWithDeadline(
      'https://api.example.test/trpc',
      undefined,
      15000,
      stalledFetch,
    );
    const assertion = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves caller cancellation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = fetchWithDeadline(
      'https://api.example.test/trpc',
      { signal: controller.signal },
      15000,
      stalledFetch,
    );
    const assertion = expect(request).rejects.toThrow('Cancelled by caller');
    controller.abort(new Error('Cancelled by caller'));
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not leave a deadline behind after a successful response', async () => {
    vi.useFakeTimers();
    await expect(
      fetchWithDeadline(
        'https://api.example.test/trpc',
        undefined,
        15000,
        async () => new Response('ok'),
      ),
    ).resolves.toBeInstanceOf(Response);
    expect(vi.getTimerCount()).toBe(0);
  });
});
