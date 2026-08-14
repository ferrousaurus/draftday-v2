/**
 * Scoring engine (§3.3): projectedPoints = Σ (stat × points-per-unit) under the
 * active settings. Purely client-side; never depends on season or ADP.
 */
import type { PlayerRecord, Position, RawStats, ScoringSettings } from './types.ts';

/** QB: PAYD×payds + PATD×patd + INT×intRate + RUYD×ruyd + RUTD×rutd (others price at 0 by default). */
export function computeProjectedPoints(player: PlayerRecord, scoring: ScoringSettings): number {
  const s = player.rawStats;
  const qb =
    (player.position === 'QB' ? (s.pAtt ?? 0) : 0) * scoring.passAttempts +
    (player.position === 'QB' ? (s.cmp ?? 0) : 0) * scoring.completions +
    (s.payd ?? 0) * scoring.passYards +
    (s.patd ?? 0) * scoring.passTd +
    (s.int ?? 0) * scoring.interceptions;
  const rush = (s.ruYd ?? 0) * scoring.rushYards + (s.ruTd ?? 0) * scoring.rushTd;
  const recv = (s.rcYd ?? 0) * scoring.recvYards + (s.rcTd ?? 0) * scoring.recvTd;
  const ppr = (s.rec ?? 0) * receptionsRate(player.position, scoring);
  const dst =
    (s.sacks ?? 0) * scoring.defSacks +
    (s.defInt ?? 0) * scoring.defInt +
    (s.ff ?? 0) * scoring.defForceFumble +
    (s.fr ?? 0) * scoring.defRecoverFumble +
    (s.saf ?? 0) * scoring.defSafeties +
    (s.defTd ?? 0) * scoring.defTd;
  return qb + rush + recv + ppr + dst;
}

export function receptionsRate(position: Position, scoring: ScoringSettings): number {
  switch (position) {
    case 'RB': {
      return scoring.receptionsRb;
    }
    case 'WR': {
      return scoring.receptionsWr;
    }
    case 'TE': {
      return scoring.receptionsTe;
    }
    case 'QB':
    case 'DST': {
      return 0;
    }
    default: {
      return 0;
    }
  }
}

/** Replacement rank per position, league-derived (§6.1). */
export function replacementRank(
  position: Position,
  teams: number,
  roster: {
    startingQb: number;
    startingRb: number;
    startingWr: number;
    startingTe: number;
    startingDst: number;
    flex: number;
    superflex: number;
  },
): number {
  // Odd team counts round up to the next even number before ranks are computed.
  const evenTeams = teams % 2 === 0 ? teams : teams + 1;
  switch (position) {
    case 'QB': {
      return evenTeams * (roster.startingQb + roster.superflex);
    }
    case 'RB': {
      return evenTeams * (roster.startingRb + roster.flex / 2);
    }
    case 'WR': {
      return evenTeams * (roster.startingWr + roster.flex / 2);
    }
    case 'TE': {
      return evenTeams * roster.startingTe;
    }
    case 'DST': {
      return evenTeams * roster.startingDst;
    }
    default: {
      return 0;
    }
  }
}

/**
 * Per-position replacement baseline: projected points of the player at the
 * replacement rank (1-based, clamped to [1, position count]).
 */
export function replacementBaseline(
  position: Position,
  projected: readonly number[],
  teams: number,
  roster: {
    startingQb: number;
    startingRb: number;
    startingWr: number;
    startingTe: number;
    startingDst: number;
    flex: number;
    superflex: number;
  },
): number {
  if (projected.length === 0) {
    return 0;
  }
  const sorted = [...projected].sort((a, b) => b - a);
  const rawRank = replacementRank(position, teams, roster);
  const rank = Math.min(Math.max(Math.round(rawRank), 1), sorted.length);
  return sorted[rank - 1] ?? 0;
}

export function computeVorp(projectedPoints: number, baseline: number): number {
  return projectedPoints - baseline;
}

export type RawStatsLike = Partial<Record<keyof RawStats, number>>;
