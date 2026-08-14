import type { AppSettings, DraftType, Platform, QbType, ScoringFormat } from './types.ts';
import { z } from 'zod';

/** Default scoring table (§3.2). */
export const DEFAULT_SCORING = {
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
  receptionsRb: 0.5,
  receptionsWr: 0.5,
  receptionsTe: 0.5,
  defSacks: 1,
  defInt: 2,
  defForceFumble: 1,
  defRecoverFumble: 1,
  defSafeties: 2,
  defTd: 6,
} as const;

export const DEFAULT_ROSTER = {
  startingQb: 1,
  startingRb: 2,
  startingWr: 3,
  startingTe: 1,
  startingDst: 1,
  flex: 1,
  superflex: 0,
  auctionBudget: 200,
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  platform: 'ESPN',
  leagueAware: false,
  leagueId: '',
  espnS2: '',
  swid: '',
  draftType: 'REDRAFT',
  leagueSize: 12,
  scoring: { ...DEFAULT_SCORING },
  roster: { ...DEFAULT_ROSTER },
  season: 2026,
};

const rate = (min: number, max: number) => z.number().min(min).max(max);
const count = (min: number, max: number) => z.number().int().min(min).max(max);

export const scoringSchema = z.object({
  passAttempts: rate(0, 10),
  completions: rate(0, 10),
  targets: rate(0, 10),
  passYards: rate(0.01, 0.2),
  passTd: rate(0, 10),
  interceptions: rate(-5, 0),
  rushYards: rate(0.01, 0.2),
  rushTd: rate(0, 10),
  recvYards: rate(0.01, 0.2),
  recvTd: rate(0, 10),
  receptionsRb: rate(0, 2),
  receptionsWr: rate(0, 2),
  receptionsTe: rate(0, 2),
  defSacks: rate(0, 10),
  defInt: rate(0, 10),
  defForceFumble: rate(0, 10),
  defRecoverFumble: rate(0, 10),
  defSafeties: rate(0, 10),
  defTd: rate(0, 10),
});

export const rosterSchema = z.object({
  startingQb: count(0, 5),
  startingRb: count(0, 8),
  startingWr: count(0, 10),
  startingTe: count(0, 6),
  startingDst: count(0, 3),
  flex: count(0, 10),
  superflex: count(0, 5),
  auctionBudget: count(50, 500),
});

export const settingsSchema = z.object({
  platform: z.enum(['ESPN', 'Yahoo', 'Sleeper']),
  leagueAware: z.boolean(),
  leagueId: z.string(),
  espnS2: z.string(),
  swid: z.string(),
  draftType: z.enum(['REDRAFT', 'BEST_BALL', 'DYNASTY']),
  leagueSize: count(2, 32),
  scoring: scoringSchema,
  roster: rosterSchema,
  season: count(2020, 2035),
});

export const DRAFT_TYPES_BY_PLATFORM: Record<Platform, readonly DraftType[]> = {
  ESPN: ['REDRAFT'],
  Yahoo: ['REDRAFT', 'BEST_BALL'],
  Sleeper: ['REDRAFT', 'BEST_BALL', 'DYNASTY'],
};

/** PPR chip presets: selecting one writes all three RECEPTIONS fields at once (§3.2). */
export const PPR_PRESETS = [0, 0.5, 1] as const;
export type PprPreset = (typeof PPR_PRESETS)[number];

/**
 * The PPR chip's displayed value, derived from the canonical RECEPTIONS triple.
 * Returns 'custom' when the three values diverge or take a non-preset value.
 */
export function pprPreset(receptions: { rb: number; wr: number; te: number }): PprPreset | 'custom' {
  const { rb, wr, te } = receptions;
  if (rb === wr && wr === te) {
    const preset = PPR_PRESETS.find((p) => p === rb);
    if (preset !== undefined) {
      return preset;
    }
  }
  return 'custom';
}

/** `qbType` is derived, never stored: STARTING QB + STARTING SUPERFLEX ≥ 2 → 2QB (§3.2). */
export function deriveQbType(roster: { startingQb: number; superflex: number }): QbType {
  return roster.startingQb + roster.superflex >= 2 ? '2QB' : '1QB';
}

/**
 * `scoringFormat` is derived, never stored — used only for the BeatADP URL (§3.2).
 * PPR 0 → STANDARD, 0.5 → HALF_PPR, 1 → PPR, Custom → PPR.
 */
export function deriveScoringFormat(receptions: { rb: number; wr: number; te: number }): ScoringFormat {
  const preset = pprPreset(receptions);
  if (preset === 0) {
    return 'STANDARD';
  }
  if (preset === 0.5) {
    return 'HALF_PPR';
  }
  return 'PPR';
}

/** All three RECEPTIONS fields at once from a PPR preset. */
export function receptionsFromPpr(preset: PprPreset): { rb: number; wr: number; te: number } {
  return { rb: preset, wr: preset, te: preset };
}
