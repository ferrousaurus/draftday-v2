/**
 * Board search-param state (§8.2): `q`, `pos`, `sort`, `dir`, `steals`.
 * Board deep-links restore this state; back/forward works. Draft-tracking state
 * is deliberately NOT in search params.
 */
import type { Position } from './types.ts';

export const POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE', 'DST'];

export const STEALS_VALUES = ['all', 'steals', 'reaches', 'none'] as const;
export type StealsFilter = (typeof STEALS_VALUES)[number];

export type BoardSearch = {
  q: string;
  pos: string;
  sort: string;
  dir: 'asc' | 'desc';
  steals: StealsFilter;
};

export const BOARD_SEARCH_DEFAULTS: BoardSearch = {
  q: '',
  pos: '',
  sort: 'adp',
  dir: 'asc',
  steals: 'all',
};

export function isStealsFilter(value: unknown): value is StealsFilter {
  if (typeof value !== 'string') {
    return false;
  }
  return STEALS_VALUES.some((s) => s === value);
}

export function parseBoardSearch(search: Record<string, unknown>): BoardSearch {
  const q = typeof search.q === 'string' ? search.q : BOARD_SEARCH_DEFAULTS.q;
  const pos = typeof search.pos === 'string' ? search.pos : BOARD_SEARCH_DEFAULTS.pos;
  const sort = typeof search.sort === 'string' ? search.sort : BOARD_SEARCH_DEFAULTS.sort;
  const dir = search.dir === 'desc' ? 'desc' : BOARD_SEARCH_DEFAULTS.dir;
  const steals = isStealsFilter(search.steals) ? search.steals : BOARD_SEARCH_DEFAULTS.steals;
  return { q, pos, sort, dir, steals };
}
