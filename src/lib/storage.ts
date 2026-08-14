/**
 * Persistence (§7): IndexedDB via idb-keyval is the canonical store.
 * Keys: `file` (raw upload), `players` (parsed table), `adpCache` (provider
 * responses, midnight-UTC expiry), plus the zustand persist slices
 * (`settings`, `drafted`) which use the custom IndexedDB adapter below.
 * No localStorage anywhere.
 */
import type { AdpRecord, PlayerRecord } from './types.ts';
import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
import { msUntilNextUtcMidnightMs } from './time.ts';

export const FILE_KEY = 'file';
export const PLAYERS_KEY = 'players';
export const ADP_CACHE_KEY = 'adpCache';

export type AdpCacheEntry = { data: AdpRecord[]; fetchedAt: number };

export async function loadFile(): Promise<ArrayBuffer | null> {
  const v = await get<unknown>(FILE_KEY);
  return v instanceof ArrayBuffer ? v : null;
}

export async function saveFile(data: ArrayBuffer): Promise<void> {
  await set(FILE_KEY, data);
}

export async function clearFile(): Promise<void> {
  await del(FILE_KEY);
}

export async function loadPlayers(): Promise<PlayerRecord[] | null> {
  const v = await get<unknown>(PLAYERS_KEY);
  return Array.isArray(v) && v.every((x) => isPlayerRecord(x)) ? v : null;
}

function isPlayerRecord(value: unknown): value is PlayerRecord {
  const entries = new Map(entriesOf(value));
  const id = entries.get('id');
  const position = entries.get('position');
  const name = entries.get('name');
  const team = entries.get('team');
  const bye = entries.get('bye');
  const rawStats = entries.get('rawStats');
  const filePoints = entries.get('filePoints');
  const playerId = entries.get('playerId');
  const ref = entries.get('ref');
  return (
    typeof id === 'string' &&
    typeof position === 'string' &&
    typeof name === 'string' &&
    typeof team === 'string' &&
    typeof bye === 'number' &&
    typeof rawStats === 'object' &&
    rawStats !== null &&
    typeof filePoints === 'number' &&
    (typeof playerId === 'number' || playerId === null) &&
    typeof ref === 'number'
  );
}

/** Narrow unknown objects to entry tuples without type assertions. */
function entriesOf(value: unknown): [string, unknown][] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value);
}

export async function savePlayers(players: PlayerRecord[]): Promise<void> {
  await set(PLAYERS_KEY, players);
}

/** A cached ADP entry is fresh until the next UTC midnight (§5.2/§5.3/§7). */
export function isAdpEntryFresh(entry: AdpCacheEntry, nowEpochMs: number = Date.now()): boolean {
  return entry.fetchedAt > 0 && entry.fetchedAt < nowEpochMs && entry.fetchedAt >= todayUtcMidnight(nowEpochMs);
}

function todayUtcMidnight(nowEpochMs: number): number {
  const d = new Date(nowEpochMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function getAdpCache(providerKey: string): Promise<AdpCacheEntry | null> {
  const cache = await readAdpCache();
  const entry = cache[providerKey];
  if (entry === undefined || !isAdpEntryFresh(entry)) {
    return null;
  }
  return entry;
}

export async function setAdpCache(providerKey: string, data: AdpRecord[]): Promise<void> {
  const cache = await readAdpCache();
  cache[providerKey] = { data, fetchedAt: Date.now() };
  await writeAdpCache(cache);
}

export async function deleteAdpCache(providerKey: string): Promise<void> {
  const cache = await readAdpCache();
  delete cache[providerKey];
  await writeAdpCache(cache);
}

async function readAdpCache(): Promise<Record<string, AdpCacheEntry>> {
  const v = await get<unknown>(ADP_CACHE_KEY);
  const out: Record<string, AdpCacheEntry> = {};
  for (const [key, entry] of entriesOf(v)) {
    const parsed = parseAdpCacheEntry(entry);
    if (parsed !== null) {
      out[key] = parsed;
    }
  }
  return out;
}

function parseAdpCacheEntry(value: unknown): AdpCacheEntry | null {
  const entries = new Map(entriesOf(value));
  const data = entries.get('data');
  const fetchedAt = entries.get('fetchedAt');
  if (!Array.isArray(data) || typeof fetchedAt !== 'number') {
    return null;
  }
  const records: AdpRecord[] = [];
  for (const record of data) {
    if (typeof record !== 'object' || record === null) {
      continue;
    }
    const fields = new Map(entriesOf(record));
    const name = fields.get('name');
    const team = fields.get('team');
    const adp = fields.get('adp');
    if (typeof name === 'string' && typeof team === 'string' && (typeof adp === 'number' || adp === null)) {
      records.push({ key: name, name, team, position: null, adp, source: 'platform' });
    }
  }
  return { data: records, fetchedAt };
}

async function writeAdpCache(cache: Record<string, AdpCacheEntry>): Promise<void> {
  await set(ADP_CACHE_KEY, cache);
}

/** The custom Zustand persister over idb-keyval (§7) — no localStorage. */
export function createIndexedDbStorage(name: string): StateStorage {
  return {
    getItem: async (key) => {
      const value = await get<unknown>(`${name}:${key}`);
      return typeof value === 'string' ? value : null;
    },
    setItem: async (key, value) => {
      await set(`${name}:${key}`, value);
    },
    removeItem: async (key) => {
      await del(`${name}:${key}`);
    },
  };
}

/** Wipe everything ("Start over", §7). */
export async function clearAll(): Promise<void> {
  await Promise.all([clearFile(), del(PLAYERS_KEY), del(ADP_CACHE_KEY), del('settings:state'), del('drafted:state')]);
}

export function ttlUntilMidnight(): number {
  return msUntilNextUtcMidnightMs(Date.now());
}

export type { AppSettings } from './types.ts';
