/** Bound every API operation; a stalled server must not permanently occupy the sync writer. */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 15000,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const requestedSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = requestedSignal
    ? AbortSignal.any([requestedSignal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          'The server did not respond within 15 seconds. Try again when it is available.',
          'TimeoutError',
        ),
      ),
    timeoutMs,
  );
  try {
    return await fetcher(input, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}
