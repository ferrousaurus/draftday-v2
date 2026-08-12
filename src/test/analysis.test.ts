/**
 * Analysis tests (§6): VORP baselines, log-linear regression, xADP clamp,
 * deltas and the round rule, plus the midnight-UTC expiry helper and the
 * ADP-mode derivation used for caching keys (§5.1/§7).
 */
import { describe, expect, it } from 'vitest';
import { buildBoard, clampToAdp, fitLogLinear, MIN_REGRESSION_SAMPLE } from '../lib/analysis.ts';
import { replacementBaseline, replacementRank } from '../lib/scoring.ts';
import { msUntilNextUtcMidnight, msUntilNextUtcMidnightMs } from '../lib/time.ts';
import { adpCacheKey, adpModeFor } from '../lib/adp.ts';
import { DEFAULT_SETTINGS } from '../lib/settings.ts';
import type { AppSettings, PlayerAdp, PlayerRecord } from '../lib/types.ts';

function player(
  position: PlayerRecord['position'],
  name: string,
  rawStats: PlayerRecord['rawStats'],
  filePoints = 100,
): PlayerRecord {
  return { id: `${position}:${name}`, position, name, team: 'X', bye: 0, rawStats, filePoints, playerId: null, ref: 1 };
}

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  leagueSize: 12,
  roster: {
    startingQb: 1,
    startingRb: 2,
    startingWr: 3,
    startingTe: 1,
    startingDst: 1,
    flex: 1,
    superflex: 0,
    auctionBudget: 200,
  },
};

describe('replacement baselines (§6.1)', () => {
  it('uses league-derived replacement ranks with defaults: QB12/RB30/WR42/TE12/DST12', () => {
    expect(replacementRank('QB', 12, settings.roster)).toBe(12);
    expect(replacementRank('RB', 12, settings.roster)).toBe(30);
    expect(replacementRank('WR', 12, settings.roster)).toBe(42);
    expect(replacementRank('TE', 12, settings.roster)).toBe(12);
    expect(replacementRank('DST', 12, settings.roster)).toBe(12);
  });

  it('rounds odd team counts up to the next even number before ranks', () => {
    expect(replacementRank('QB', 11, settings.roster)).toBe(12);
    expect(replacementRank('WR', 9, settings.roster)).toBe(35); // 10 × (3 + 0.5)
  });

  it('baseline is the projected points of the player at the replacement rank, clamped to the position count', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => 150 - i * 10);
    expect(replacementBaseline('QB', fifteen, 12, settings.roster)).toBe(40); // rank 12 → 150 − 11×10
    const five = [50, 40, 30, 20, 10];
    expect(replacementBaseline('QB', five, 12, settings.roster)).toBe(10); // rank 12 → clamp to 5
    expect(replacementBaseline('QB', [], 12, settings.roster)).toBe(0);
  });
});

describe('VORP + board assembly', () => {
  // 6 QBs with a wide VORP spread (baseline = 6th-highest QB points) + 3 RBs,
  // so the QB regression has ≥ 5 positive-VORP samples with ADP (§6.2).
  function makeBoard(adp: ReadonlyMap<string, PlayerAdp>) {
    const rows = [
      player('QB', 'A', { payd: 4200, patd: 30, int: 8, ruYd: 250, ruTd: 1 }),
      player('QB', 'B', { payd: 4000, patd: 28, int: 9, ruYd: 200, ruTd: 1 }),
      player('QB', 'C', { payd: 3700, patd: 25, int: 10, ruYd: 150, ruTd: 0 }),
      player('QB', 'D', { payd: 3400, patd: 23, int: 11, ruYd: 120, ruTd: 0 }),
      player('QB', 'E', { payd: 3100, patd: 20, int: 12, ruYd: 90, ruTd: 0 }),
      player('QB', 'F', { payd: 2600, patd: 15, int: 15, ruYd: 60, ruTd: 0 }),
      player('RB', 'D', { ruYd: 1500, ruTd: 14, rec: 45, rcYd: 350, rcTd: 2 }),
      player('RB', 'E', { ruYd: 900, ruTd: 6, rec: 30, rcYd: 200, rcTd: 1 }),
      player('RB', 'F', { ruYd: 500, ruTd: 3, rec: 20, rcYd: 100, rcTd: 0 }),
    ];
    return buildBoard(rows, settings, adp);
  }

  it('computes projected points and VORP immediately (no ADP required)', () => {
    const { rows } = makeBoard(new Map());
    expect(rows.length).toBe(9);
    for (const r of rows) {
      expect(r.vorp).toBeTypeOf('number');
      expect(r.projectedPoints).toBeGreaterThan(0);
      expect(r.adp).toBeNull();
      expect(r.xadp).toBeNull();
      expect(r.delta).toBeNull();
    }
  });

  it('fits the log-linear regression on positive-VORP players with ADP and derives xADP + delta', () => {
    const adp = new Map<string, PlayerAdp>([
      ['QB:A', { adp: 8, source: 'platform' }],
      ['QB:B', { adp: 60, source: 'platform' }],
      ['QB:C', { adp: 110, source: 'platform' }],
      ['QB:D', { adp: 150, source: 'platform' }],
      ['QB:E', { adp: 200, source: 'platform' }],
      ['RB:D', { adp: 4, source: 'platform' }],
      ['RB:E', { adp: 90, source: 'platform' }],
    ]);
    const { rows, regressions } = makeBoard(adp);
    const qbFit = regressions.get('QB');
    expect(qbFit).toBeDefined();
    if (qbFit !== undefined) {
      expect(qbFit.sample).toBeGreaterThanOrEqual(MIN_REGRESSION_SAMPLE);
      expect(qbFit.b).toBeLessThan(0); // ln(adp) decreases as VORP increases
    }
    const a = rows.find((r) => r.player.name === 'A');
    expect(a?.xadp).not.toBeNull();
    expect(a?.delta).not.toBeNull();
    // Below-replacement players still get xADP, clamped to the position maxADP.
    const f = rows.find((r) => r.player.name === 'F');
    expect(f?.xadp).not.toBeNull();
  });

  it('marks steals (delta ≥ teams) and reaches (delta ≤ −teams)', () => {
    const adp = new Map<string, PlayerAdp>([
      ['QB:A', { adp: 8, source: 'platform' }],
      ['QB:B', { adp: 60, source: 'platform' }],
      ['QB:C', { adp: 110, source: 'platform' }],
      ['QB:D', { adp: 150, source: 'platform' }],
      ['QB:E', { adp: 200, source: 'platform' }],
      ['RB:D', { adp: 4, source: 'platform' }],
      ['RB:E', { adp: 90, source: 'platform' }],
    ]);
    const { rows } = makeBoard(adp);
    // C has a large ADP relative to its xADP → steal territory; assert the rule
    // mapping holds for every row with a delta and that the fit produced one.
    let sawDelta = false;
    for (const r of rows) {
      if (r.delta === null) continue;
      sawDelta = true;
      expect(r.steal).toBe(r.delta >= settings.leagueSize);
      expect(r.reach).toBe(r.delta <= -settings.leagueSize);
    }
    expect(sawDelta).toBe(true);
  });

  it('emits a footnote when a position has fewer than 5 positive-VORP players with ADP', () => {
    const adp = new Map<string, PlayerAdp>([['QB:A', { adp: 8, source: 'platform' }]]);
    const { notes } = makeBoard(adp);
    expect(notes.some((n) => n.includes('QB xADP unavailable'))).toBe(true);
  });
});

describe('fitLogLinear (§6.2)', () => {
  it('recovers the OLS coefficients for a perfect log-linear relationship', () => {
    // ln(adp) = 4 − 0.02·vorp
    const points = [10, 20, 30, 40, 50, 60].map((vorp) => ({ vorp, adp: Math.exp(4 - 0.02 * vorp) }));
    const fit = fitLogLinear(points);
    expect(fit).not.toBeNull();
    expect(fit?.b).toBeCloseTo(-0.02, 6);
    expect(fit?.a).toBeCloseTo(4, 6);
  });

  it('returns null below the minimum sample size', () => {
    expect(fitLogLinear([{ vorp: 10, adp: 20 }])).toBeNull();
  });

  it('returns null for degenerate fits (zero VORP variance)', () => {
    const points = Array.from({ length: 6 }, () => ({ vorp: 5, adp: 20 }));
    expect(fitLogLinear(points)).toBeNull();
  });

  it('clamps xADP into [1, maxADP]', () => {
    expect(clampToAdp(0.5, 100)).toBe(1);
    expect(clampToAdp(200, 100)).toBe(100);
    expect(clampToAdp(42, 100)).toBe(42);
  });
});

describe('midnight-UTC expiry helper (§5.2/§7)', () => {
  it('computes ms until the next UTC midnight', () => {
    const before = msUntilNextUtcMidnightMs(Date.UTC(2026, 7, 12, 14, 32, 0, 0));
    expect(before).toBe(9 * 3600_000 + 28 * 60_000);
    const nearMidnight = msUntilNextUtcMidnightMs(Date.UTC(2026, 7, 12, 23, 59, 59, 500));
    expect(nearMidnight).toBe(500);
  });

  it('exposes the Temporal-typed form used server-side', () => {
    const ttl = msUntilNextUtcMidnight(Temporal.Instant.from('2026-08-12T00:00:00Z'));
    expect(ttl).toBe(24 * 3600_000);
  });
});

describe('ADP mode derivation and cache keys (§5.1/§7)', () => {
  it('routes league-aware ESPN to kona and keys by (season, leagueId, qbType) — never credentials', () => {
    const s: AppSettings = {
      ...settings,
      platform: 'ESPN',
      leagueAware: true,
      leagueId: '12345',
      espnS2: 'secret-s2',
      swid: 'secret-swid',
      season: 2026,
    };
    const mode = adpModeFor(s);
    expect(mode.kind).toBe('kona');
    if (mode.kind === 'kona') {
      expect(mode.leagueId).toBe('12345');
      expect(adpCacheKey(mode)).toBe('kona:2026:12345:1QB');
    }
  });

  it('routes everything else to BeatADP with a scoringFormat-derived key', () => {
    const yahoo = adpModeFor({ ...settings, platform: 'Yahoo' });
    expect(yahoo.kind).toBe('beatadp');
    if (yahoo.kind === 'beatadp') {
      expect(yahoo.scoringFormat).toBe('HALF_PPR');
      expect(adpCacheKey(yahoo)).toBe('beatadp:HALF_PPR:REDRAFT:1QB');
    }
    const zeroPpr = adpModeFor({
      ...settings,
      platform: 'Sleeper',
      scoring: { ...settings.scoring, receptionsRb: 0, receptionsWr: 0, receptionsTe: 0 },
    });
    if (zeroPpr.kind === 'beatadp') {
      expect(zeroPpr.scoringFormat).toBe('STANDARD');
    }
  });
});
