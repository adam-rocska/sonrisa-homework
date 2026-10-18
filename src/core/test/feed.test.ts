import { describe, expect, it, vi } from 'vitest';
import { fetchFeed, parseFeed } from '../src/index.js';

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>google:1</id><title>News &amp; &lt;b&gt;updates&lt;/b&gt;</title><link rel="alternate" href="https://example.test/a"/><published>2026-10-18T12:00:00Z</published></entry></feed>`;
describe('RSS and Atom parsing', () => {
  it('reads Google-style Atom, extracts plaintext and domain Dates', () => {
    const result = parseFeed(atom);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'News & updates',
      url: 'https://example.test/a',
      publishedAt: new Date('2026-10-18T12:00:00Z'),
    });
    expect(result[0]?.key).toHaveLength(64);
  });
  it('reads RSS GUID, link and nullable publication time', () => {
    const result = parseFeed(
      '<rss version="2.0"><channel><item><guid isPermaLink="false">a</guid><title>Hello</title><link>https://example.test/a</link><pubDate>invalid</pubDate></item></channel></rss>',
    );
    expect(result[0]).toMatchObject({ title: 'Hello', publishedAt: null });
  });
  it('deduplicates a stable item ID and uses URL when ID is absent', () => {
    expect(
      parseFeed(
        atom.replace(
          '</entry>',
          '</entry><entry><id>google:1</id><title>New title</title><link href="https://example.test/a"/></entry>',
        ),
      ),
    ).toHaveLength(1);
    expect(
      parseFeed('<rss><channel><item><link>https://example.test/a</link></item></channel></rss>')[0]
        ?.title,
    ).toBe('Untitled update');
  });
  it('accepts an explicitly empty valid feed', () => {
    expect(
      parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Nothing yet</title></feed>'),
    ).toEqual([]);
    expect(parseFeed('<rss><channel><title>Empty</title></channel></rss>')).toEqual([]);
  });
  it.each([
    '<html><body>Please sign in</body></html>',
    '<feed><entry></feed>',
    '<!DOCTYPE feed [<!ENTITY x "boom">]><feed><title>&x;</title></feed>',
    '<feed><entry><id>a</id><link href="javascript:alert(1)"/></entry></feed>',
    '<rss><channel><item><title>No valid link</title></item></channel></rss>',
  ])('rejects malformed, unsafe or non-feed input', (xml) => {
    expect(() => parseFeed(xml)).toThrow();
  });
  it('rejects an excessive item count', () => {
    expect(() =>
      parseFeed(
        `<feed>${'<entry><id>a</id><link href="https://example.test/"/></entry>'.repeat(2001)}</feed>`,
      ),
    ).toThrow('2000-item');
  });
});
describe('bounded feed HTTP reads', () => {
  it('disallows redirects, sets a deadline and parses the body', async () => {
    const fetcher = vi.fn(async () => new Response(atom));
    expect(
      await fetchFeed('https://example.test/feed', fetcher, { timeoutMs: 1000, maxBytes: 10_000 }),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/feed',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    );
  });
  it('rejects an HTTP failure without exposing response text', async () => {
    await expect(
      fetchFeed(
        'https://example.test/feed',
        async () => new Response('sensitive error', { status: 503 }),
        { timeoutMs: 1000, maxBytes: 10_000 },
      ),
    ).rejects.toThrow('HTTP 503');
  });
  it('rejects both declared and streamed oversized responses', async () => {
    await expect(
      fetchFeed(
        'https://example.test/feed',
        async () => new Response(atom, { headers: { 'content-length': '10000' } }),
        { timeoutMs: 1000, maxBytes: 10 },
      ),
    ).rejects.toThrow('size limit');
    await expect(
      fetchFeed('https://example.test/feed', async () => new Response(atom), {
        timeoutMs: 1000,
        maxBytes: 10,
      }),
    ).rejects.toThrow('size limit');
  });
});
