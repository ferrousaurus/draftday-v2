/**
 * Board analysis (§6): VORP baselines, per-position isotonic xADP mapping (§6.2),
 * and market-vs-projection deltas (§6.3). Everything is derived client-side
 * from the parsed players, the active settings, and the ADP map.
 */
import type { AppSettings, BoardPlayer, PlayerAdp, PlayerRecord, Position } from './types.ts';
import { computeProjectedPoints, replacementBaseline, replacementRank } from './scoring.ts';

export const MIN_REGRESSION_SAMPLE = 5;

const BOARD_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST'] as const;

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

/** Compute the full board table: Projected Points, VORP, ADP, xADP, delta (§2.2, §6). */
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

/** Rank a single position's players by projected points for the replacement baseline. */
export function rankOf(position: Position, teams: number, roster: AppSettings['roster']): number {
  return replacementRank(position, teams, roster);
}

export type { AdpRecord, PlayerAdp } from './types.ts';
