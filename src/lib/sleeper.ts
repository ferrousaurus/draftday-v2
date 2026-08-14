/**
 * Sleeper league mapping (§5.4) — pure functions over the public Sleeper API
 * JSON, fixture-tested. `https://api.sleeper.app/v1/league/{leagueId}` returns
 * `settings.scoring` (rate per stat key), `settings.roster` (starters +
 * roster_positions), `total_rosters`, and `type`
 * (`redraft`/`dynasty`/`keeper`/`best_ball`).
 */
import type { LeagueSettings, ScoringSettings } from './types.ts';

export type SleeperLeagueJson = {
  type?: string;
  total_rosters?: number;
  settings?: {
    scoring?: Record<string, number>;
    roster?: { starters?: string[]; roster_positions?: string[] };
  };
};

const SLEEPER_SCORING_KEYS: Record<string, keyof ScoringSettings> = {
  pass_yd: 'passYards',
  pass_td: 'passTd',
  pass_int: 'interceptions',
  rush_yd: 'rushYards',
  rush_td: 'rushTd',
  rec_yd: 'recvYards',
  rec_td: 'recvTd',
  rec_rb: 'receptionsRb',
  rec_wr: 'receptionsWr',
  rec_te: 'receptionsTe',
  dst_sack: 'defSacks',
  dst_int: 'defInt',
  dst_ff: 'defForceFumble',
  dst_fr: 'defRecoverFumble',
  dst_safe: 'defSafeties',
  dst_td: 'defTd',
};

const POSITION_SLOT_IDS = ['QB', 'RB', 'WR', 'TE', 'DEF', 'FLEX', 'SUPER_FLEX'] as const;

/** Accepts `unknown` and parses defensively (no type assertions). */
export function mapSleeperLeague(json: unknown): LeagueSettings | null {
  const entries = new Map(entriesOf(json));
  const type = entries.get('type');
  const totalRosters = entries.get('total_rosters');
  const settingsEntries = new Map(entriesOf(entries.get('settings')));
  const scoring = settingsEntries.get('scoring');
  const starters = new Map(entriesOf(settingsEntries.get('roster'))).get('starters');
  if (typeof totalRosters !== 'number') {
    return null;
  }
  const scoringMap = new Map<string, number>();
  for (const [key, rate] of entriesOf(scoring)) {
    if (typeof rate === 'number') {
      scoringMap.set(key, rate);
    }
  }
  const appScoring = applySleeperScoring({ ...sleeperDefaultScoring() }, scoringMap);
  const counts = countStarters(starters);
  const typeName = typeof type === 'string' ? type : 'redraft';
  let draftType: 'REDRAFT' | 'BEST_BALL' | 'DYNASTY' = 'REDRAFT';
  switch (typeName) {
    case 'best_ball': {
      draftType = 'BEST_BALL';
      break;
    }
    case 'dynasty': {
      draftType = 'DYNASTY';
      break;
    }
    default: {
      // keeper maps to REDRAFT (§5.4)
      draftType = 'REDRAFT';
      break;
    }
  }

  return {
    leagueSize: totalRosters,
    scoring: appScoring,
    roster: {
      startingQb: counts.qb,
      startingRb: counts.rb,
      startingWr: counts.wr,
      startingTe: counts.te,
      startingDst: counts.dst,
      flex: counts.flex,
      superflex: counts.superflex,
      auctionBudget: 200,
    },
    draftType,
  };
}

function applySleeperScoring(appScoring: ScoringSettings, scoringMap: Map<string, number>): ScoringSettings {
  for (const [key, field] of Object.entries(SLEEPER_SCORING_KEYS)) {
    const rate = scoringMap.get(key);
    if (rate !== undefined) {
      appScoring[field] = rate;
    }
  }
  return appScoring;
}

function countStarters(starters: unknown): {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  dst: number;
  flex: number;
  superflex: number;
} {
  const counts = { qb: 0, rb: 0, wr: 0, te: 0, dst: 0, flex: 0, superflex: 0 };
  if (Array.isArray(starters)) {
    for (const slot of starters) {
      if (typeof slot !== 'string') {
        continue;
      }
      switch (slot) {
        case 'QB': {
          counts.qb += 1;
          break;
        }
        case 'RB': {
          counts.rb += 1;
          break;
        }
        case 'WR': {
          counts.wr += 1;
          break;
        }
        case 'TE': {
          counts.te += 1;
          break;
        }
        case 'DEF': {
          counts.dst += 1;
          break;
        }
        case 'FLEX': {
          counts.flex += 1;
          break;
        }
        case 'SUPER_FLEX': {
          counts.superflex += 1;
          break;
        }
      }
    }
  }
  return counts;
}

function entriesOf(value: unknown): [string, unknown][] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value);
}

function sleeperDefaultScoring(): ScoringSettings {
  return {
    passAttempts: 0,
    completions: 0,
    targets: 0,
    passYards: 0.04,
    passTd: 4,
    interceptions: -2,
    rushYards: 0.1,
    rushTd: 6,
    recvYards: 0.1,
    recvTd: 6,
    receptionsRb: 0,
    receptionsWr: 0,
    receptionsTe: 0,
    defSacks: 1,
    defInt: 2,
    defForceFumble: 1,
    defRecoverFumble: 1,
    defSafeties: 2,
    defTd: 6,
  };
}

export type { POSITION_SLOT_IDS };
