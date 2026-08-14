/**
 * ADP fetching (§8.2): TanStack Query behind the server functions, with the
 * IndexedDB adpCache as the freshness authority. Refetch happens when the
 * provider key changes (settings changes) or via "Refresh ADP" (invalidate,
 * after clearing the client cache).
 */
import type { AdpMode, AdpRecord, AppSettings } from './types.ts';
import { adpCacheKey, adpModeFor } from './adp.ts';
import { deleteAdpCache, getAdpCache, setAdpCache } from './storage.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deriveScoringFormat } from './settings.ts';
import { fetchBeatAdp } from '../server/beatadp.ts';
import { fetchKonaLeague } from '../server/kona.ts';

export type AdpQueryResult = {
  records: AdpRecord[];
  fetchedAt: number | null;
  mode: AdpMode;
  degraded: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
};

function hasCredentials(settings: AppSettings): boolean {
  return settings.espnS2 !== '' && settings.swid !== '';
}

/** Effective mode: league-aware ESPN without credentials degrades to BeatADP's ESPN column (§5.5). */
export function effectiveMode(settings: AppSettings): { mode: AdpMode; degraded: boolean } {
  const mode = adpModeFor(settings);
  if (mode.kind === 'kona' && !hasCredentials(settings)) {
    const scoringFormat = deriveScoringFormat({
      rb: settings.scoring.receptionsRb,
      wr: settings.scoring.receptionsWr,
      te: settings.scoring.receptionsTe,
    });
    return {
      mode: {
        kind: 'beatadp',
        platform: 'ESPN',
        draftType: settings.draftType,
        qbType: mode.qbType,
        scoringFormat,
      },
      degraded: true,
    };
  }
  return { mode, degraded: false };
}

async function fetchRecords(
  settings: AppSettings,
  mode: AdpMode,
): Promise<{ records: AdpRecord[]; fetchedAt: number }> {
  if (mode.kind === 'kona') {
    const result = await fetchKonaLeague({
      data: { season: mode.season, leagueId: mode.leagueId, espnS2: settings.espnS2, swid: settings.swid },
    });
    return { records: result.players, fetchedAt: Date.now() };
  }
  const result = await fetchBeatAdp({
    data: {
      platform: mode.platform,
      draftType: mode.draftType,
      qbType: mode.qbType,
      scoringFormat: mode.scoringFormat,
    },
  });
  const records = result.table === null ? [] : toRecords(result.table, mode.platform);
  return { records, fetchedAt: result.fetchedAt };
}

function toRecords(
  table: {
    rows: {
      name: string;
      team: string | null;
      consensus: number | null;
      sleeper: number | null;
      espn: number | null;
      yahoo: number | null;
    }[];
  },
  platform: 'ESPN' | 'Yahoo' | 'Sleeper',
): AdpRecord[] {
  const records: AdpRecord[] = [];
  for (const row of table.rows) {
    let value: number | null = null;
    switch (platform) {
      case 'ESPN': {
        value = row.espn;
        break;
      }
      case 'Yahoo': {
        value = row.yahoo;
        break;
      }
      case 'Sleeper': {
        value = row.sleeper;
        break;
      }
    }
    const source = value === null ? 'consensus' : 'platform';
    const adp = value ?? row.consensus;
    records.push({
      key: row.name,
      name: row.name,
      team: row.team ?? '',
      position: null,
      adp,
      source,
    });
  }
  return records;
}

export function useAdp(settings: AppSettings): AdpQueryResult {
  const queryClient = useQueryClient();
  const { mode, degraded } = effectiveMode(settings);
  const cacheKey = adpCacheKey(mode);

  const query = useQuery({
    queryKey: ['adp', cacheKey, degraded ? 'degraded' : 'normal'],
    queryFn: async () => {
      const cached = await getAdpCache(cacheKey);
      if (cached !== null) {
        return { records: cached.data, fetchedAt: cached.fetchedAt };
      }
      const fetched = await fetchRecords(settings, mode);
      await setAdpCache(cacheKey, fetched.records);
      return fetched;
    },
    staleTime: 0,
    retry: 1,
  });

  return {
    records: query.data?.records ?? [],
    fetchedAt: query.data?.fetchedAt ?? null,
    mode,
    degraded,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => query.refetch(),
    refresh: async () => {
      await deleteAdpCache(cacheKey);
      return queryClient.invalidateQueries({ queryKey: ['adp'] });
    },
  };
}
