/**
 * Board analysis (§6): VORP baselines, per-position log-linear xADP regression,
 * deltas and the round rule. Everything is derived client-side from the parsed
 * players, the active settings, and the ADP map.
 */
import type {
  AdpRecord,
  AppSettings,
  BoardPlayer,
  PlayerAdp,
  PlayerRecord,
  Position,
  RegressionResult,
} from './types.ts';
import { computeProjectedPoints, replacementBaseline, replacementRank } from './scoring.ts';

export const MIN_REGRESSION_SAMPLE = 5;

/** OLS fit of `ln(adp) = a + b·vorp` (§6.2). Returns null for degenerate fits. */
export function fitLogLinear(points: ReadonlyArray<{ vorp: number; adp: number }>): { a: number; b: number } | null {
  const n = points.length;
  if (n < MIN_REGRESSION_SAMPLE) return null;
  const meanVorp = points.reduce((sum, p) => sum + p.vorp, 0) / n;
  const meanLn = points.reduce((sum, p) => sum + Math.log(p.adp), 0) / n;
  let ssX = 0;
  let ssXy = 0;
  for (const p of points) {
    const dx = p.vorp - meanVorp;
    ssX += dx * dx;
    ssXy += dx * (Math.log(p.adp) - meanLn);
  }
  // Degenerate fit (zero variance in VORP or ln(ADP)) → null, never a garbage line.
  if (ssX === 0 || !Number.isFinite(ssXy)) return null;
  const b = ssXy / ssX;
  const a = meanLn - b * meanVorp;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

export function clampToAdp(value: number, maxAdp: number): number {
  return Math.min(Math.max(value, 1), maxAdp);
}

/** Compute the full board table: Projected Points, VORP, ADP, xADP, delta, steal/reach (§2.2, §6). */
export function buildBoard(
  players: ReadonlyArray<PlayerRecord>,
  settings: AppSettings,
  adpByPlayer: ReadonlyMap<string, PlayerAdp>,
): { rows: BoardPlayer[]; regressions: ReadonlyMap<Position, RegressionResult>; notes: string[] } {
  const projected = new Map<string, number>();
  const projectedByPosition = new Map<Position, number[]>();
  for (const p of players) {
    const pts = computeProjectedPoints(p, settings.scoring);
    projected.set(p.id, pts);
    const list = projectedByPosition.get(p.position) ?? [];
    list.push(pts);
    projectedByPosition.set(p.position, list);
  }

  const baselines = new Map<Position, number>();
  const notes: string[] = [];
  for (const position of ['QB', 'RB', 'WR', 'TE', 'DST'] as const) {
    baselines.set(
      position,
      replacementBaseline(position, projectedByPosition.get(position) ?? [], settings.leagueSize, settings.roster),
    );
  }

  const rows: BoardPlayer[] = players.map((p) => {
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

  // Per-position fit over matched players with ADP and positive VORP (§6.2).
  const regressions = new Map<Position, RegressionResult>();
  for (const position of ['QB', 'RB', 'WR', 'TE', 'DST'] as const) {
    const sample: Array<{ vorp: number; adp: number }> = [];
    let maxAdp = 0;
    for (const r of rows) {
      if (r.player.position !== position || r.adp === null || r.adp <= 0 || r.vorp <= 0) continue;
      sample.push({ vorp: r.vorp, adp: r.adp });
      maxAdp = Math.max(maxAdp, r.adp);
    }
    const fit = fitLogLinear(sample);
    if (fit === null || maxAdp === 0) {
      notes.push(
        sample.length < MIN_REGRESSION_SAMPLE
          ? `${position} xADP unavailable: fewer than ${MIN_REGRESSION_SAMPLE} positive-VORP players with ADP`
          : `${position} xADP unavailable: degenerate fit`,
      );
      continue;
    }
    regressions.set(position, { position, a: fit.a, b: fit.b, maxAdp, sample: sample.length });
  }

  const teams = settings.leagueSize;
  for (const r of rows) {
    const reg = regressions.get(r.player.position);
    if (reg === undefined) continue;
    // Below-replacement players clamp to the end of the board (§6.2).
    const xadp = clampToAdp(Math.exp(reg.a + reg.b * r.vorp), reg.maxAdp);
    r.xadp = xadp;
    if (r.adp !== null) {
      r.delta = r.adp - xadp;
      r.steal = r.delta >= teams;
      r.reach = r.delta <= -teams;
    }
  }

  return { rows, regressions, notes };
}

/** Rank a single position's players by projected points for the replacement baseline. */
export function rankOf(position: Position, teams: number, roster: AppSettings['roster']): number {
  return replacementRank(position, teams, roster);
}

export type { AdpRecord, PlayerAdp };
