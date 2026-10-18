import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FeedItem } from './domain.js';

export class FeedReadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FeedReadError';
  }
}
type XmlNode = Record<string, unknown>;
function node(value: unknown): XmlNode | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : undefined;
}
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  const element = node(value);
  return typeof element?.['#text'] === 'string' ? element['#text'] : '';
}
function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function articleUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '' &&
      value.length <= 8192
    )
      return url.href;
  } catch {
    /* The caller receives a bounded, source-independent error. */
  }
  throw new FeedReadError('Feed contains an invalid article link');
}
function atomLink(value: unknown): string {
  for (const item of array(value)) {
    const link = node(item);
    if (
      link !== undefined &&
      (link['@_rel'] === undefined || link['@_rel'] === 'alternate') &&
      typeof link['@_href'] === 'string'
    )
      return link['@_href'];
  }
  return '';
}
export function parseFeed(xml: string): FeedItem[] {
  if (xml.length === 0 || /<!DOCTYPE|<!ENTITY/iu.test(xml) || XMLValidator.validate(xml) !== true)
    throw new FeedReadError('Feed is not safe, well-formed XML');
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
  }).parse(xml);
  const root = node(parsed);
  const atom = node(root?.['feed']);
  const rss = node(node(root?.['rss'])?.['channel']);
  if (atom === undefined && rss === undefined) throw new FeedReadError('Expected RSS or Atom feed');
  const rawItems = array(atom === undefined ? rss?.['item'] : atom['entry']);
  if (rawItems.length > 2000) throw new FeedReadError('Feed exceeds the 2000-item limit');
  const deduped = new Map<string, FeedItem>();
  for (const raw of rawItems) {
    const item = node(raw);
    if (item === undefined) throw new FeedReadError('Feed contains a malformed item');
    const id = text(item[atom === undefined ? 'guid' : 'id']);
    const url = articleUrl(atom === undefined ? text(item['link']) || id : atomLink(item['link']));
    // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted titles.
    const controlCharacters = /[\u0000-\u001f\u007f]/gu;
    const title =
      text(item['title'])
        .replace(/<[^>]*>/gu, '')
        .replace(controlCharacters, ' ')
        .trim()
        .slice(0, 5000) || 'Untitled update';
    const rawDate =
      text(item[atom === undefined ? 'pubDate' : 'published']) || text(item['updated']);
    const timestamp = Date.parse(rawDate);
    const key = createHash('sha256')
      .update(id || url)
      .digest('hex');
    deduped.set(key, {
      key,
      title,
      url,
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp) : null,
    });
  }
  return [...deduped.values()];
}
export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export async function fetchFeed(
  url: string,
  fetcher: FetchFunction,
  options: { readonly timeoutMs: number; readonly maxBytes: number },
): Promise<FeedItem[]> {
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: {
      accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9',
    },
  });
  if (!response.ok) throw new FeedReadError(`Feed request failed (HTTP ${response.status})`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > options.maxBytes) {
    await response.body?.cancel();
    throw new FeedReadError('Feed response exceeds size limit');
  }
  if (response.body === null) throw new FeedReadError('Feed response is empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > options.maxBytes) {
        await reader.cancel();
        throw new FeedReadError('Feed response exceeds size limit');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return parseFeed(Buffer.concat(chunks).toString('utf8'));
}
