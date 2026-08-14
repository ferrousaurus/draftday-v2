/**
 * BeatADP provider (§5.2) — TanStack Start server function. Scrapes the
 * server-rendered platform-adp HTML table, parses it (parsing isolated in
 * `lib/beatadp-html.ts`), and caches the parsed table in Deno KV per
 * `(scoringFormat, draftType, qbType)` with midnight-UTC expiry. Empty results
 * are cached under the same key (no special-casing).
 */
import type { DraftType, QbType, ScoringFormat } from '../lib/types.ts';
import { type ParsedBeatAdpTable, parseBeatAdpHtml } from '../lib/beatadp-html.ts';
import { createServerFn } from '@tanstack/react-start';
import { entriesOf } from '../lib/object-entries.ts';
import { msUntilNextUtcMidnight } from '../lib/time.ts';
import { openKv } from './kv.ts';

export type BeatAdpRequest = {
  platform: 'ESPN' | 'Yahoo' | 'Sleeper';
  draftType: DraftType;
  qbType: QbType;
  scoringFormat: ScoringFormat;
};

export type BeatAdpResult = {
  table: ParsedBeatAdpTable | null;
  fetchedAt: number;
};

const BASE_URL = 'https://www.beatadp.com/platform-adp';

export function beatAdpUrl(params: { scoringFormat: ScoringFormat; draftType: DraftType; qbType: QbType }): string {
  const url = new URL(BASE_URL);
  url.searchParams.set('scoringFormat', params.scoringFormat);
  url.searchParams.set('draftType', params.draftType);
  url.searchParams.set('qbType', params.qbType);
  return url.toString();
}

function cacheKey(params: { scoringFormat: ScoringFormat; draftType: DraftType; qbType: QbType }): Deno.KvKey {
  return ['beatadp', params.scoringFormat, params.draftType, params.qbType];
}

type CachedBeatAdp = { data: ParsedBeatAdpTable | null; fetchedAt: number };

function isCachedBeatAdp(value: unknown): value is CachedBeatAdp {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entries = new Map(entriesOf(value));
  const data = entries.get('data');
  const fetchedAt = entries.get('fetchedAt');
  if (typeof fetchedAt !== 'number') {
    return false;
  }
  if (data === null) {
    return true;
  }
  if (typeof data !== 'object') {
    return false;
  }
  const rows = new Map(entriesOf(data)).get('rows');
  return Array.isArray(rows);
}

export async function getCachedBeatAdp(params: {
  scoringFormat: ScoringFormat;
  draftType: DraftType;
  qbType: QbType;
}): Promise<CachedBeatAdp | null> {
  const kv = await openKv();
  const entry = await kv.get(cacheKey(params));
  if (!isCachedBeatAdp(entry.value)) {
    return null;
  }
  return entry.value;
}

export async function putCachedBeatAdp(
  params: { scoringFormat: ScoringFormat; draftType: DraftType; qbType: QbType },
  cached: CachedBeatAdp,
): Promise<void> {
  const kv = await openKv();
  // Deno KV expiry is non-strict; a key may persist briefly past midnight (§5.2).
  const ttl = msUntilNextUtcMidnight();
  await kv.set(cacheKey(params), cached, { expireIn: ttl });
}

async function scrape(params: {
  scoringFormat: ScoringFormat;
  draftType: DraftType;
  qbType: QbType;
}): Promise<ParsedBeatAdpTable | null> {
  const res = await fetch(beatAdpUrl(params), { headers: { 'accept-language': 'en' } });
  if (!res.ok) {
    throw new Error(`BeatADP responded ${res.status}`);
  }
  const html = await res.text();
  return parseBeatAdpHtml(html);
}

/** Plain data path (cache → scrape → cache); the server fn wraps it (§5.2). */
export async function fetchBeatAdpData(params: {
  scoringFormat: ScoringFormat;
  draftType: DraftType;
  qbType: QbType;
}): Promise<BeatAdpResult> {
  const cached = await getCachedBeatAdp(params);
  if (cached !== null) {
    return { table: cached.data, fetchedAt: cached.fetchedAt };
  }
  const table = await scrape(params);
  const fetchedAt = Date.now();
  await putCachedBeatAdp(params, { data: table, fetchedAt });
  return { table, fetchedAt };
}

export const fetchBeatAdp = createServerFn({ method: 'POST' })
  .validator((input: BeatAdpRequest) => input)
  .handler(({ data }) => fetchBeatAdpData(data));
