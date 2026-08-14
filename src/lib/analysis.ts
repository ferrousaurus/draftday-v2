/**
 * Board analysis (§6): VORP baselines, per-position isotonic xADP mapping (§6.2),
 * deltas and per-round-bucket steal/reach flags spanning all positions (§6.3).
 * Everything is derived client-side from the parsed players, the active
 * settings, and the ADP map.
 */
import type { AppSettings, BoardPlayer, PlayerAdp, PlayerRecord, Position } from './types.ts';
import { computeProjectedPoints, replacementBaseline, replacementRank } from './scoring.ts';

export const MIN_REGRESSION_SAMPLE = 5;

const BOARD_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST'] as const;

/** Max steals / max reaches flagged per round bucket (§6.3). */
export const STEAL_REACH_PER_SIDE = 3;

/**
 * Strong floor for a steal/reach flag (§6.3): a quarter-round of picks at the
 * league's size (3 picks at 12 teams). Deltas at or above this magnitude are
 * unambiguous mispricings and always flag.
 */
export function strongDeltaFloor(teams: number): number {
  return Math.max(2, Math.ceil(teams / 4));
}

/**
 * Fill floor for a steal/reach flag (§6.3): deltas below this magnitude are
 * sub-round noise and never flag. When a round bucket has fewer strong
 * candidates than the per-side cap, the next-best candidates at or above this
 * floor fill the remaining slots — every round surfaces suggestions without
 * flagging sub-1-pick noise (1 pick at 12 teams).
 */
export function fillDeltaFloor(teams: number): number {
  return Math.max(1, Math.floor(teams / 8));
}

/**
 * Isotonic (PAVA) fit of the expected-ADP curve per position (§6.2): the fitted
 * value at a player's VORP is the ADP the market gives equally-projected players.
 * `adp` must be non-increasing in `vorp` (higher VORP ⇒ earlier pick); groups
 * that violate monotonicity pool into blocks at the weighted mean ADP.
 *
 * Sample: every ADP-bearing player of the position, any VORP sign (bench players
 * are drafted too). Players with equal VORP share one group, so they always get
 * the same fitted xADP. Returns the vorp → fitted-ADP map; null for degenerate
 * inputs (no points, no variance in ADP).
 */
export function fitIsotonicAdp(points: readonly { vorp: number; adp: number }[]): Map<number, number> | null {
  if (points.length === 0) {
    return null;
  }
  const byVorp = new Map<number, { sum: number; count: number }>();
  for (const p of points) {
    const group = byVorp.get(p.vorp) ?? { sum: 0, count: 0 };
    group.sum += p.adp;
    group.count += 1;
    byVorp.set(p.vorp, group);
  }
  const vorps = [...byVorp.keys()].sort((a, b) => a - b);
  // Ascending-VORP blocks; enforce non-increasing block value (weighted PAVA).
  const stack: { vorps: number[]; value: number; count: number }[] = [];
  for (const vorp of vorps) {
    const group = byVorp.get(vorp);
    if (group === undefined) {
      continue;
    }
    let block = { vorps: [vorp], value: group.sum / group.count, count: group.count };
    let top = stack.at(-1);
    while (top !== undefined && top.value < block.value) {
      stack.pop();
      const count = top.count + block.count;
      block = {
        vorps: [...top.vorps, ...block.vorps],
        value: (top.value * top.count + block.value * block.count) / count,
        count,
      };
      top = stack.at(-1);
    }
    stack.push(block);
  }
  const fitted = new Map<number, number>();
  for (const block of stack) {
    for (const vorp of block.vorps) {
      fitted.set(vorp, block.value);
    }
  }
  return fitted;
}

/** A flag candidate: an above-replacement player with a delta. */
export type BucketCandidate = { adp: number; delta: number; id: string };

function byDelta(direction: 1 | -1) {
  return (a: { c: BucketCandidate }, b: { c: BucketCandidate }): number => {
    const da = a.c.delta * direction;
    const db = b.c.delta * direction;
    return db - da || a.c.adp - b.c.adp || a.c.id.localeCompare(b.c.id);
  };
}

/**
 * Pick one side (steals or reaches) of a round bucket: the strongest
 * candidates at or past the strong floor first; if fewer than `perSide` clear
 * it, the next-best candidates at or past the fill floor top up the side.
 * Ties break by delta, then ADP, then id, so the output is deterministic.
 */
function pickSide(
  bucket: readonly { i: number; c: BucketCandidate }[],
  perSide: number,
  strongFloor: number,
  fillFloor: number,
  direction: 1 | -1,
): { i: number; c: BucketCandidate }[] {
  const strong = bucket
    .filter((x) => direction * x.c.delta >= strongFloor)
    .sort(byDelta(direction))
    .slice(0, perSide);
  const count = strong.length;
  if (count >= perSide) {
    return strong;
  }
  const strongIndexes = new Set(strong.map((x) => x.i));
  const fill = bucket
    .filter((x) => !strongIndexes.has(x.i) && direction * x.c.delta >= fillFloor)
    .sort(byDelta(direction))
    .slice(0, perSide - count);
  return [...strong, ...fill];
}

/**
 * Steal/reach flags (§6.3): bucket the candidates by ADP round
 * (`floor((adp − 1) / teams)` picks — all positions compete within a round),
 * and within each bucket flag the strongest divergences — up to `perSide`
 * steals (largest `delta ≥ strongFloor`, topped up from `delta ≥ fillFloor`)
 * and up to `perSide` reaches (most negative `delta ≤ −strongFloor`, topped up
 * from `delta ≤ −fillFloor`). Ties break by delta, then ADP, then id, so the
 * output is deterministic. Advice is relative to the player's draft
 * neighborhood: a round never floods with flags, every round surfaces
 * suggestions when its deltas support them, and buckets with only sub-noise
 * deltas flag nothing. Returns one flag pair per input candidate, in input
 * order.
 */
export function bucketFlags(
  candidates: readonly BucketCandidate[],
  teams: number,
  perSide: number,
  strongFloor: number,
  fillFloor: number,
): readonly { steal: boolean; reach: boolean }[] {
  const flags = candidates.map(() => ({ steal: false, reach: false }));
  const byBucket = new Map<number, number[]>();
  candidates.forEach((c, i) => {
    const key = Math.floor((c.adp - 1) / teams);
    const list = byBucket.get(key) ?? [];
    list.push(i);
    byBucket.set(key, list);
  });
  for (const indexes of byBucket.values()) {
    const bucketCandidates = indexes
      .map((i) => ({ i, c: candidates[i] }))
      .filter((x): x is { i: number; c: BucketCandidate } => x.c !== undefined);
    for (const { i } of pickSide(bucketCandidates, perSide, strongFloor, fillFloor, 1)) {
      const f = flags[i];
      if (f !== undefined) {
        f.steal = true;
      }
    }
    for (const { i } of pickSide(bucketCandidates, perSide, strongFloor, fillFloor, -1)) {
      const f = flags[i];
      if (f !== undefined) {
        f.reach = true;
      }
    }
  }
  return flags;
}

/** Compute the full board table: Projected Points, VORP, ADP, xADP, delta, steal/reach (§2.2, §6). */
export function buildBoard(
  players: readonly PlayerRecord[],
  settings: AppSettings,
  adpByPlayer: ReadonlyMap<string, PlayerAdp>,
): { rows: BoardPlayer[]; notes: string[] } {
  const { projected, byPosition } = projectPlayers(players, settings.scoring);
  const baselines = computeBaselines(byPosition, settings);
  const notes: string[] = [];
  const rows = buildRows(players, projected, baselines, adpByPlayer);
  const fittedByPosition = fitPositions(rows, notes);
  applyXadp(rows, fittedByPosition);
  applyFlags(rows, settings.leagueSize);
  return { rows, notes };
}

function projectPlayers(
  players: readonly PlayerRecord[],
  scoring: AppSettings['scoring'],
): { projected: Map<string, number>; byPosition: Map<Position, number[]> } {
  const projected = new Map<string, number>();
  const byPosition = new Map<Position, number[]>();
  for (const p of players) {
    const pts = computeProjectedPoints(p, scoring);
    projected.set(p.id, pts);
    const list = byPosition.get(p.position) ?? [];
    list.push(pts);
    byPosition.set(p.position, list);
  }
  return { projected, byPosition };
}

function computeBaselines(byPosition: Map<Position, number[]>, settings: AppSettings): Map<Position, number> {
  const baselines = new Map<Position, number>();
  for (const position of BOARD_POSITIONS) {
    baselines.set(
      position,
      replacementBaseline(position, byPosition.get(position) ?? [], settings.leagueSize, settings.roster),
    );
  }
  return baselines;
}

function buildRows(
  players: readonly PlayerRecord[],
  projected: Map<string, number>,
  baselines: Map<Position, number>,
  adpByPlayer: ReadonlyMap<string, PlayerAdp>,
): BoardPlayer[] {
  return players.map((p) => {
    const pts = projected.get(p.id) ?? 0;
    const vorp = pts - (baselines.get(p.position) ?? 0);
    const adpInfo = adpByPlayer.get(p.id);
    return {
      player: p,
      projectedPoints: pts,
      vorp,
      adp: adpInfo?.adp ?? null,
      adpSource: adpInfo?.source ?? null,
      xadp: null,
      delta: null,
      steal: false,
      reach: false,
    };
  });
}

/**
 * Per-position isotonic fits (§6.2). Sample: every ADP-bearing player of the
 * position, any VORP sign — bench players get real xADPs too. A position with
 * too few ADP-bearing players overall emits the footer note and no xADP.
 */
function fitPositions(rows: BoardPlayer[], notes: string[]): Map<Position, Map<number, number>> {
  const fittedByPosition = new Map<Position, Map<number, number>>();
  for (const position of BOARD_POSITIONS) {
    const sample: { vorp: number; adp: number }[] = [];
    for (const r of rows) {
      if (r.player.position !== position) {
        continue;
      }
      if (r.adp === null || r.adp <= 0) {
        continue;
      }
      sample.push({ vorp: r.vorp, adp: r.adp });
    }
    if (sample.length < MIN_REGRESSION_SAMPLE) {
      notes.push(`${position} xADP unavailable: fewer than ${MIN_REGRESSION_SAMPLE} players with ADP`);
      continue;
    }
    const fitted = fitIsotonicAdp(sample);
    if (fitted === null) {
      notes.push(`${position} xADP unavailable: degenerate fit`);
      continue;
    }
    fittedByPosition.set(position, fitted);
  }
  return fittedByPosition;
}

function applyXadp(rows: BoardPlayer[], fittedByPosition: Map<Position, Map<number, number>>): void {
  for (const r of rows) {
    if (r.adp === null) {
      continue; // no ADP → no anchor, no xADP (§6.2)
    }
    const fitted = fittedByPosition.get(r.player.position);
    if (fitted === undefined) {
      continue;
    }
    const xadp = fitted.get(r.vorp);
    if (xadp === undefined) {
      continue;
    }
    r.xadp = xadp;
    r.delta = r.adp - xadp;
  }
}

/**
 * Steal/reach flags (§6.3): per round bucket (a round is `TEAMS` picks,
 * spanning all positions) — the strongest divergences within each player's
 * draft neighborhood flag, capped at STEAL_REACH_PER_SIDE per side and
 * topped up by the fill floor when a side comes up short, so every round
 * surfaces a handful of suggestions. Market-vs-projection gaps are systematic
 * across the draft (one league's ADP can overpay entire early rounds against
 * the projections file); the per-position isotonic xADP mapping absorbs the
 * systematic component (§6.2), so a delta is already relative to the player's
 * own position, and ranking those deltas within a round keeps the advice
 * neighborhood-relative. Flags are value signals: they only apply to
 * above-replacement (vorp > 0) players — replacement-level ADP is
 * idiosyncratic tail noise (handcuffs, dart throws). Bench players keep
 * their xADP/delta columns but never flag.
 */
function applyFlags(rows: BoardPlayer[], teams: number): void {
  const candidates: BucketCandidate[] = [];
  for (const r of rows) {
    if (r.adp === null || r.delta === null || r.vorp <= 0) {
      continue;
    }
    candidates.push({ adp: r.adp, delta: r.delta, id: r.player.id });
  }
  if (candidates.length === 0) {
    return;
  }
  const flags = bucketFlags(candidates, teams, STEAL_REACH_PER_SIDE, strongDeltaFloor(teams), fillDeltaFloor(teams));
  const flagById = new Map<string, { steal: boolean; reach: boolean }>();
  candidates.forEach((c, i) => {
    const f = flags[i];
    if (f !== undefined) {
      flagById.set(c.id, f);
    }
  });
  for (const r of rows) {
    if (r.vorp <= 0) {
      continue;
    }
    const f = flagById.get(r.player.id);
    if (f === undefined) {
      continue;
    }
    r.steal = f.steal;
    r.reach = f.reach;
  }
}

/** Rank a single position's players by projected points for the replacement baseline. */
export function rankOf(position: Position, teams: number, roster: AppSettings['roster']): number {
  return replacementRank(position, teams, roster);
}

export type { AdpRecord, PlayerAdp } from './types.ts';
