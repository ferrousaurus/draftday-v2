/**
 * Sleeper league settings (§5.4) — TanStack Start server function. The league
 * endpoint is public (no auth); `leagueId` is a public identifier (§5.5).
 */
import { createServerFn } from '@tanstack/react-start';
import type { LeagueSettings } from '../lib/types.ts';
import { mapSleeperLeague, type SleeperLeagueJson } from '../lib/sleeper.ts';

export type SleeperRequest = { leagueId: string };

export type SleeperResult = { settings: LeagueSettings };

/** Plain data path; the server fn wraps it (§5.4). */
export async function fetchSleeperLeagueData(leagueId: string): Promise<SleeperResult> {
  const res = await fetch(`https://api.sleeper.app/v1/league/${encodeURIComponent(leagueId)}`);
  if (!res.ok) {
    throw new Error(`Sleeper responded ${res.status}`);
  }
  const json: unknown = await res.json();
  const settings = mapSleeperLeague(parseSleeperLeagueJson(json));
  if (settings === null) {
    throw new Error('Sleeper league settings could not be parsed');
  }
  return { settings };
}

export const fetchSleeperLeague = createServerFn({ method: 'POST' })
  .validator((input: SleeperRequest) => input)
  .handler(async ({ data }) => fetchSleeperLeagueData(data.leagueId));

/** Defensive parse of the public Sleeper league JSON (no type assertions). */
function parseSleeperLeagueJson(json: unknown): SleeperLeagueJson {
  const out: SleeperLeagueJson = {};
  if (typeof json !== 'object' || json === null) return out;
  for (const [key, value] of Object.entries(json)) {
    if (key === 'total_rosters' && typeof value === 'number') out.total_rosters = value;
    if (key === 'type' && typeof value === 'string') out.type = value;
    if (key === 'settings' && typeof value === 'object' && value !== null) out.settings = parseSleeperSettings(value);
  }
  return out;
}

function parseSleeperSettings(value: object): NonNullable<SleeperLeagueJson['settings']> {
  const out: NonNullable<SleeperLeagueJson['settings']> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'scoring' && typeof entry === 'object' && entry !== null) {
      const scoring: Record<string, number> = {};
      for (const [stat, rate] of Object.entries(entry)) {
        if (typeof rate === 'number') scoring[stat] = rate;
      }
      out.scoring = scoring;
    }
    if (key === 'roster' && typeof entry === 'object' && entry !== null) {
      const roster: NonNullable<SleeperLeagueJson['settings']>['roster'] = {};
      for (const [rosterKey, value] of Object.entries(entry)) {
        if (rosterKey === 'starters' && Array.isArray(value)) {
          roster.starters = value.filter((s): s is string => typeof s === 'string');
        }
        if (rosterKey === 'roster_positions' && Array.isArray(value)) {
          roster.roster_positions = value.filter((s): s is string => typeof s === 'string');
        }
      }
      out.roster = roster;
    }
  }
  return out;
}
