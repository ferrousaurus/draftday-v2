/**
 * Kona provider (§5.3) — TanStack Start server function for league-aware ESPN.
 * Cookie-authenticated; responses are NEVER cached server-side (no Deno KV, no
 * in-memory cache) — the only kona cache is the client-side IndexedDB adpCache.
 * `espn_s2`/`SWID` are transmitted per request and never retained (§5.5).
 */
import { createServerFn } from '@tanstack/react-start';
import type { AdpRecord, LeagueSettings } from '../lib/types.ts';
import { konaVariant, mapKonaPlayers, mapKonaSettings } from '../lib/kona.ts';

export type KonaRequest = {
  season: number;
  leagueId: string;
  espnS2: string;
  swid: string;
};

export type KonaResult = {
  settings: LeagueSettings;
  players: AdpRecord[];
};

function konaUrl(season: number, leagueId: string): string {
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`;
}

function settingsUrl(season: number, leagueId: string): string {
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings`;
}

function filterHeader(variant: string): string {
  return JSON.stringify({
    players: {
      filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
      filterSlotIds: { value: [0, 2, 4, 6, 16] },
      filterRanksForScoringPeriodIds: { value: [1] },
      sortDraftRanks: { sortPriority: 100, sortAsc: true, value: variant },
      limit: 1000,
    },
  });
}

async function fetchJson(url: string, request: KonaRequest): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'X-Fantasy-Filter': filterHeader('STANDARD'),
      Cookie: `swid=${request.swid}; espn_s2=${request.espnS2}`,
    },
  });
  if (!res.ok) {
    throw new Error(`ESPN responded ${res.status}`);
  }
  return res.json();
}

/** Plain data path (never cached server-side, §5.3); the server fn wraps it. */
export async function fetchKonaLeagueData(data: KonaRequest): Promise<KonaResult> {
  // Two cookie-authenticated calls; nothing is cached or retained server-side.
  const [playersJson, settingsJson] = await Promise.all([
    fetchJson(konaUrl(data.season, data.leagueId), data),
    fetchJson(settingsUrl(data.season, data.leagueId), data),
  ]);

  const settings = mapKonaSettings(unwrapSettings(settingsJson));
  if (settings === null) {
    throw new Error('ESPN league settings could not be parsed');
  }
  const variant = konaVariant(settings);
  const players = mapKonaPlayers(playersJson, variant);
  return { settings, players };
}

/** The mSettings view wraps the league settings under a `settings` key. */
function unwrapSettings(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json;
  for (const [key, value] of Object.entries(json)) {
    if (key === 'settings') return value;
  }
  return json;
}

export const fetchKonaLeague = createServerFn({ method: 'POST' })
  .validator((input: KonaRequest) => input)
  .handler(async ({ data }) => fetchKonaLeagueData(data));
