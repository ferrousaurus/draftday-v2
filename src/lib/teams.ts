/**
 * Single internal team mapping spanning every source (§4):
 * workbook codes (3-letter), BeatADP (3-letter, verified live 2026-08-12),
 * ESPN `proTeamId` classic numbering (verified live 2026-08-12 for a sample),
 * `WSH`/`WAS` unification, and DST full-name / nickname forms.
 */
import type { Position } from './types.ts';

export type TeamInfo = {
  code: string;
  full: string;
  city: string;
  nickname: string;
};

const TEAMS: readonly TeamInfo[] = [
  { code: 'ARI', full: 'Arizona Cardinals', city: 'Arizona', nickname: 'Cardinals' },
  { code: 'ATL', full: 'Atlanta Falcons', city: 'Atlanta', nickname: 'Falcons' },
  { code: 'BAL', full: 'Baltimore Ravens', city: 'Baltimore', nickname: 'Ravens' },
  { code: 'BUF', full: 'Buffalo Bills', city: 'Buffalo', nickname: 'Bills' },
  { code: 'CAR', full: 'Carolina Panthers', city: 'Carolina', nickname: 'Panthers' },
  { code: 'CHI', full: 'Chicago Bears', city: 'Chicago', nickname: 'Bears' },
  { code: 'CIN', full: 'Cincinnati Bengals', city: 'Cincinnati', nickname: 'Bengals' },
  { code: 'CLE', full: 'Cleveland Browns', city: 'Cleveland', nickname: 'Browns' },
  { code: 'DAL', full: 'Dallas Cowboys', city: 'Dallas', nickname: 'Cowboys' },
  { code: 'DEN', full: 'Denver Broncos', city: 'Denver', nickname: 'Broncos' },
  { code: 'DET', full: 'Detroit Lions', city: 'Detroit', nickname: 'Lions' },
  { code: 'GB', full: 'Green Bay Packers', city: 'Green Bay', nickname: 'Packers' },
  { code: 'HOU', full: 'Houston Texans', city: 'Houston', nickname: 'Texans' },
  { code: 'IND', full: 'Indianapolis Colts', city: 'Indianapolis', nickname: 'Colts' },
  { code: 'JAX', full: 'Jacksonville Jaguars', city: 'Jacksonville', nickname: 'Jaguars' },
  { code: 'KC', full: 'Kansas City Chiefs', city: 'Kansas City', nickname: 'Chiefs' },
  { code: 'LV', full: 'Las Vegas Raiders', city: 'Las Vegas', nickname: 'Raiders' },
  { code: 'LAC', full: 'Los Angeles Chargers', city: 'Los Angeles', nickname: 'Chargers' },
  { code: 'LAR', full: 'Los Angeles Rams', city: 'Los Angeles', nickname: 'Rams' },
  { code: 'MIA', full: 'Miami Dolphins', city: 'Miami', nickname: 'Dolphins' },
  { code: 'MIN', full: 'Minnesota Vikings', city: 'Minnesota', nickname: 'Vikings' },
  { code: 'NE', full: 'New England Patriots', city: 'New England', nickname: 'Patriots' },
  { code: 'NO', full: 'New Orleans Saints', city: 'New Orleans', nickname: 'Saints' },
  { code: 'NYG', full: 'New York Giants', city: 'New York', nickname: 'Giants' },
  { code: 'NYJ', full: 'New York Jets', city: 'New York', nickname: 'Jets' },
  { code: 'PHI', full: 'Philadelphia Eagles', city: 'Philadelphia', nickname: 'Eagles' },
  { code: 'PIT', full: 'Pittsburgh Steelers', city: 'Pittsburgh', nickname: 'Steelers' },
  { code: 'SF', full: 'San Francisco 49ers', city: 'San Francisco', nickname: '49ers' },
  { code: 'SEA', full: 'Seattle Seahawks', city: 'Seattle', nickname: 'Seahawks' },
  { code: 'TB', full: 'Tampa Bay Buccaneers', city: 'Tampa Bay', nickname: 'Buccaneers' },
  { code: 'TEN', full: 'Tennessee Titans', city: 'Tennessee', nickname: 'Titans' },
  { code: 'WSH', full: 'Washington Commanders', city: 'Washington', nickname: 'Commanders' },
];

/** ESPN `proTeamId` classic numbering → internal code (spec §5.3). */
const PRO_TEAM_IDS: Readonly<Record<number, string>> = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
};

const CODE_MAP: Readonly<Record<string, string>> = Object.fromEntries(TEAMS.map((t) => [t.code, t.code]));
const FULL_NAME_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  TEAMS.map((t) => [t.full.toLowerCase(), t.code]),
);

/** Normalize an external team token (code, `WAS`/`WSH`, full name, city, nickname) → internal code. */
export function normalizeTeam(raw: string): string | null {
  const token = raw.trim().toLowerCase();
  if (token === '') {
    return null;
  }
  const asCode = CODE_MAP[token.toUpperCase()];
  if (asCode !== undefined) {
    return asCode;
  }
  // Washington appears as `WAS` on the Rankings sheet (spec §3.1/§4).
  if (token === 'was') {
    return 'WSH';
  }
  const byFull = FULL_NAME_MAP[token];
  if (byFull !== undefined) {
    return byFull;
  }
  for (const t of TEAMS) {
    if (t.city.toLowerCase() === token || t.nickname.toLowerCase() === token) {
      return t.code;
    }
  }
  return null;
}

export function teamInfo(code: string): TeamInfo | null {
  return TEAMS.find((t) => t.code === code) ?? null;
}

export function teamByProTeamId(proTeamId: number): string | null {
  return PRO_TEAM_IDS[proTeamId] ?? null;
}

/**
 * Resolve a provider-side defense name to an internal team code.
 * Accepts ESPN-style nicknames (`Broncos D/ST`, `Cardinals D/ST`) and full names
 * (`Arizona Cardinals`), with an optional team token as a cross-check.
 */
export function normalizeDefenseName(name: string, teamToken?: string | null): string | null {
  const fromToken = teamToken === undefined || teamToken === null ? null : normalizeTeam(teamToken);
  const trimmed = name.trim().replace(/\s+D\/ST$/iu, '');
  const fromName = normalizeTeam(trimmed);
  if (fromToken !== null && fromToken !== fromName) {
    return null;
  }
  return fromName ?? fromToken;
}

export function defenseNameFor(code: string): string {
  return teamInfo(code)?.full ?? code;
}

/** ESPN v3 defaultPositionId per app position (positionFromCode's inverse). */
const POSITION_CODES: Record<Position, number> = { QB: 1, RB: 2, WR: 3, TE: 4, DST: 16 };

export function positionCode(position: Position): number {
  return POSITION_CODES[position];
}

export function positionFromCode(code: number): Position | null {
  switch (code) {
    case 1: {
      return 'QB';
    }
    case 2: {
      return 'RB';
    }
    case 3: {
      return 'WR';
    }
    case 4: {
      return 'TE';
    }
    case 16: {
      return 'DST';
    }
    default: {
      return null;
    }
  }
}
