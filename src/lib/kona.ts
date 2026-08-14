/**
 * Kona provider mapping (§5.3) — pure functions over the ESPN kona JSON,
 * fixture-tested. Live-probe-verified shape (2026-08-12):
 * - `players[]` wrappers with nested `player` objects
 * - `player.ownership.averageDraftPosition` = ADP (present for every player)
 * - `player.draftRanksByRankType.<variant>.rank` = rank fallback (all four
 *   variants present; `published: false` is cosmetic)
 * - `player.proTeamId` classic numbering, `player.defaultPositionId`
 * - league settings from the `mSettings` view: `settings.size`,
 *   `settings.scoringSettings.scoringItems[]` (statId → points, with
 *   `pointsOverrides` per lineup slot), `settings.rosterSettings.lineupSlotCounts`
 *   (lineup-slot id → starter count), `settings.draftSettings`
 */
import type { AdpRecord, LeagueSettings, ScoringSettings } from './types.ts';
import { positionFromCode, teamByProTeamId } from './teams.ts';
import { deriveQbType } from './settings.ts';

export type KonaScoringItem = { statId: number; points: number; pointsOverrides?: Record<string, number> };

/** ESPN v3 fantasy stat ids → app model, pinned by the live probe (§5.3/§5.4). */
const STAT_ID_MAP: Record<string, keyof ScoringSettings> = {
  '3': 'passYards',
  '4': 'passTd',
  '20': 'interceptions',
  '24': 'rushYards',
  '25': 'rushTd',
  '42': 'recvYards',
  '43': 'recvTd',
  '17': 'receptionsRb',
  '53': 'defSacks',
  '55': 'defInt',
  '56': 'defForceFumble',
  '57': 'defRecoverFumble',
  '63': 'defTd',
  '93': 'defSafeties',
};

const RECEPTION_STAT_IDS = ['17'] as const;

/** Lineup-slot ids (ESPN v3): 0 QB, 2 RB, 4 WR, 6 TE, 16 DST, 23 FLEX, 20 SUPERFLEX. */
const LINEUP_SLOTS = {
  qb: 0,
  rb: 2,
  wr: 4,
  te: 6,
  dst: 16,
  flex: 23,
  superflex: 20,
} as const;

/**
 * Map the `mSettings` JSON to the app model (§5.4).
 * A statId with a pointsOverride for lineup slot 16 prices the DST position.
 * Accepts `unknown` and parses defensively (no type assertions).
 */
export function mapKonaSettings(json: unknown): LeagueSettings | null {
  const entries = new Map(entriesOf(json));
  const size = entries.get('size');
  const scoringItems = new Map(entriesOf(entries.get('scoringSettings'))).get('scoringItems');
  const lineupSlotCounts = new Map(entriesOf(entries.get('rosterSettings'))).get('lineupSlotCounts');
  const draftSettings = new Map(entriesOf(entries.get('draftSettings')));
  const keeperCount = draftSettings.get('keeperCount');
  const keeperCountFuture = draftSettings.get('keeperCountFuture');
  const draftType = draftSettings.get('type');
  if (typeof size !== 'number') {
    return null;
  }

  const byId = parseScoringItems(scoringItems);
  const scoring = scoringFromItems(byId);

  const counts = new Map<string, number>();
  for (const [slot, count] of entriesOf(lineupSlotCounts)) {
    if (typeof count === 'number') {
      counts.set(slot, count);
    }
  }
  const countOf = (slot: number): number => counts.get(String(slot)) ?? 0;
  // Slot 20 is SUPERFLEX when its count is small; large counts are bench slots
  // (probe: a 12-team league exposes bench as 20×7 + 21×2).
  const superflex = countOf(LINEUP_SLOTS.superflex) <= 2 ? countOf(LINEUP_SLOTS.superflex) : 0;

  const roster = {
    startingQb: countOf(LINEUP_SLOTS.qb),
    startingRb: countOf(LINEUP_SLOTS.rb),
    startingWr: countOf(LINEUP_SLOTS.wr),
    startingTe: countOf(LINEUP_SLOTS.te),
    startingDst: countOf(LINEUP_SLOTS.dst),
    flex: countOf(LINEUP_SLOTS.flex),
    superflex,
    auctionBudget: draftType === 'AUCTION' ? 200 : 200,
  };

  void keeperCount;
  void keeperCountFuture;

  return {
    leagueSize: size,
    scoring,
    roster,
    // ESPN only exposes redraft; keeper leagues map to REDRAFT (§3.2, §5.4).
    draftType: 'REDRAFT',
  };
}

function parseScoringItems(scoringItems: unknown): Map<number, KonaScoringItem> {
  const byId = new Map<number, KonaScoringItem>();
  if (Array.isArray(scoringItems)) {
    for (const item of scoringItems) {
      const itemEntries = new Map(entriesOf(item));
      const statId = itemEntries.get('statId');
      const points = itemEntries.get('points');
      const pointsOverrides = itemEntries.get('pointsOverrides');
      if (typeof statId !== 'number' || typeof points !== 'number') {
        continue;
      }
      const overrides: Record<string, number> = {};
      for (const [slot, rate] of entriesOf(pointsOverrides)) {
        if (typeof rate === 'number') {
          overrides[slot] = rate;
        }
      }
      byId.set(statId, { statId, points, pointsOverrides: overrides });
    }
  }
  return byId;
}

function scoringFromItems(byId: Map<number, KonaScoringItem>): ScoringSettings {
  const scoring = { ...defaultScoringRates() };
  for (const [statId, key] of Object.entries(STAT_ID_MAP)) {
    const item = byId.get(Number(statId));
    if (item === undefined) {
      continue;
    }
    const value = item.pointsOverrides?.['16'] ?? item.points;
    scoring[key] = value;
  }
  // A league PPR value writes all three RECEPTIONS fields (§5.4).
  const pprItem = RECEPTION_STAT_IDS.map((id) => byId.get(Number(id))).find((item) => item !== undefined);
  if (pprItem !== undefined) {
    const ppr = pprItem.pointsOverrides?.['16'] ?? pprItem.points;
    scoring.receptionsRb = ppr;
    scoring.receptionsWr = ppr;
    scoring.receptionsTe = ppr;
  }
  return scoring;
}

function entriesOf(value: unknown): [string, unknown][] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value);
}

/** Default ESPN-ish rates; only meaningful as a fallback base before overrides. */
function defaultScoringRates(): ScoringSettings {
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

/**
 * Variant selection (§5.3): SUPERFLEX when the league's qbType is 2QB, else PPR
 * when league PPR ≠ 0 (fractional included), else STANDARD. Rank fallback only —
 * ADP itself is variant-agnostic.
 */
export function konaVariant(settings: LeagueSettings): 'SUPERFLEX' | 'PPR' | 'STANDARD' {
  const qbType = deriveQbType(settings.roster);
  if (qbType === '2QB') {
    return 'SUPERFLEX';
  }
  return settings.scoring.receptionsRb === 0 ? 'STANDARD' : 'PPR';
}

/** Map the kona player pool into AdpRecords. All players have ADP (probe: 0 missing). */
export function mapKonaPlayers(json: unknown, variant: 'SUPERFLEX' | 'PPR' | 'STANDARD'): AdpRecord[] {
  const records: AdpRecord[] = [];
  const wrappers = new Map(entriesOf(json)).get('players');
  if (!Array.isArray(wrappers)) {
    return records;
  }
  for (const wrapper of wrappers) {
    const playerEntries = new Map(entriesOf(wrapper));
    const player = playerEntries.get('player');
    const fields = new Map(entriesOf(player));
    const fullName = fields.get('fullName');
    const proTeamId = fields.get('proTeamId');
    const defaultPositionId = fields.get('defaultPositionId');
    const averageDraftPosition = new Map(entriesOf(fields.get('ownership'))).get('averageDraftPosition');
    const draftRanks = new Map(entriesOf(fields.get('draftRanksByRankType')));
    const rank = new Map(entriesOf(draftRanks.get(variant))).get('rank');
    if (typeof fullName !== 'string') {
      continue;
    }
    const position = typeof defaultPositionId === 'number' ? positionFromCode(defaultPositionId) : null;
    if (position === null) {
      continue;
    }
    const team = typeof proTeamId === 'number' ? teamByProTeamId(proTeamId) : null;
    const adp = typeof averageDraftPosition === 'number' ? averageDraftPosition : null;
    records.push({
      key: `${position}:${fullName}`,
      name: fullName,
      team: team ?? '',
      position,
      adp,
      rank: typeof rank === 'number' ? rank : undefined,
      source: 'league',
    });
  }
  return records;
}
