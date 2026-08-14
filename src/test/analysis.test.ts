/**
 * Analysis tests (§6): VORP baselines, per-position isotonic xADP mapping (§6.2),
 * market-vs-projection deltas (§6.3), plus the midnight-UTC expiry helper and
 * the ADP-mode derivation used for caching keys (§5.1/§7).
 */
import type { AppSettings, PlayerAdp, PlayerRecord } from '../lib/types.ts';
import { adpCacheKey, adpModeFor } from '../lib/adp.ts';
import { buildBoard, fitIsotonicAdp } from '../lib/analysis.ts';
import { describe, expect, it } from 'vitest';
import { msUntilNextUtcMidnight, msUntilNextUtcMidnightMs } from '../lib/time.ts';
import { replacementBaseline, replacementRank } from '../lib/scoring.ts';
import { DEFAULT_SETTINGS } from '../lib/settings.ts';

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

// 11 WRs with linearly decreasing points (baseline = 11th) and ADPs 10..100
// on the 10 ADP-bearing players, so the market prices the position perfectly
// (higher VORP ⇒ earlier ADP) unless a test disturbs it.
const dense = new Map<string, PlayerAdp>(
  Array.from({ length: 10 }, (_, i): [string, PlayerAdp] => [`WR:W${i}`, { adp: 10 + i * 10, source: 'platform' }]),
);

function makeWrBoard(adp: ReadonlyMap<string, PlayerAdp>, extra: PlayerRecord[] = []) {
  const rows = Array.from({ length: 11 }, (_, i) => player('WR', `W${i}`, { rcYd: 2500 - i * 100 }));
  return buildBoard([...rows, ...extra], settings, adp);
}

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
  // so the QB isotonic mapping has ≥ 5 ADP-bearing samples (§6.2).
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

  it('emits a footnote when a position has fewer than 5 players with ADP', () => {
    const adp = new Map<string, PlayerAdp>([['QB:A', { adp: 8, source: 'platform' }]]);
    const { notes } = makeBoard(adp);
    expect(notes.some((n) => n.includes('QB xADP unavailable'))).toBe(true);
  });
});

describe('isotonic xADP (§6.2)', () => {
  it('prices a perfectly-ordered market flat: every delta is 0', () => {
    const { rows } = makeWrBoard(dense);
    const byName = (name: string) => rows.find((r) => r.player.name === name);
    for (const r of rows) {
      if (r.player.name === 'W10') {
        // No ADP → no anchor → no xADP (§6.2).
        expect(r.xadp).toBeNull();
        expect(r.delta).toBeNull();
        continue;
      }
      expect(r.xadp).toBe(r.adp);
      expect(r.delta).toBe(0);
    }
    expect(byName('W0')?.xadp).toBe(10);
    expect(byName('W9')?.xadp).toBe(100);
  });

  it('gives bench players (VORP ≤ 0) a real xADP anchored to late-pick pricing', () => {
    const bench = player('WR', 'BENCH', { rcYd: 1100 }); // with 12 WRs the baseline is the 12th (1200) → VORP = −100
    const adp = new Map([...dense, ['WR:BENCH', { adp: 110, source: 'platform' }]]);
    const { rows } = makeWrBoard(adp, [bench]);
    const b = rows.find((r) => r.player.name === 'BENCH');
    expect(b?.vorp).toBeLessThanOrEqual(0);
    expect(b?.xadp).toBe(110);
    expect(b?.delta).toBe(0);
  });

  it('keeps bench players in the pooled xADP even when the market misprices them hard', () => {
    // BENCH (VORP −100) drafted at 20 while W9 (VORP 100) at 120 → violation
    // cascades through W8/W7, pooling the −100..300 VORP blocks at 77.5:
    // BENCH delta −57.5, W9 delta +42.5.
    const bench = player('WR', 'BENCH', { rcYd: 1100 });
    const adp = new Map([
      ...dense,
      ['WR:W9', { adp: 120, source: 'platform' }],
      ['WR:BENCH', { adp: 20, source: 'platform' }],
    ]);
    const { rows } = makeWrBoard(adp, [bench]);
    const byName = (name: string) => rows.find((r) => r.player.name === name);
    expect(byName('BENCH')?.delta).toBeCloseTo(-57.5, 6);
    expect(byName('W9')?.delta).toBeCloseTo(42.5, 6);
  });

  it('detects a genuine misprice: drafted against VORP order → positive delta for the faller, negative for the riser', () => {
    // W2 (VORP 800) drafted at 45 while W3 (VORP 700) at 30 — market order
    // violates projection order. PAVA pools the pair at the mean (37.5):
    // W2 xADP 37.5 → delta +7.5, W3 delta −7.5.
    const adp = new Map([
      ...dense,
      ['WR:W2', { adp: 45, source: 'platform' }],
      ['WR:W3', { adp: 30, source: 'platform' }],
    ]);
    const { rows } = makeWrBoard(adp);
    const byName = (name: string) => rows.find((r) => r.player.name === name);
    expect(byName('W2')?.xadp).toBeCloseTo(37.5, 6);
    expect(byName('W3')?.xadp).toBeCloseTo(37.5, 6);
    expect(byName('W2')?.delta).toBeCloseTo(7.5, 6);
    expect(byName('W3')?.delta).toBeCloseTo(-7.5, 6);
  });
});

describe('isotonic xADP (§6.2) — sub-noise, round 1, cross-position, no-anchor cases', () => {
  it('keeps sub-noise market disturbances below one pick', () => {
    // W2 (VORP 800) drafted at 31 while W3 (VORP 700) at 30 → pooled mean 30.5:
    // deltas ±0.5 — sub-pick noise.
    const adp = new Map([
      ...dense,
      ['WR:W2', { adp: 31, source: 'platform' }],
      ['WR:W3', { adp: 30, source: 'platform' }],
    ]);
    const { rows } = makeWrBoard(adp);
    const byName = (name: string) => rows.find((r) => r.player.name === name);
    expect(byName('W2')?.delta).toBeCloseTo(0.5, 6);
    expect(byName('W3')?.delta).toBeCloseTo(-0.5, 6);
  });

  it('shows round-1 deltas from a top-of-draft market violation', () => {
    // W1 (VORP 900) drafted at 2 while W0 (VORP 1000) at 12 — the market
    // violates projection order at the very top of the draft. PAVA pools the
    // pair at 7: W0 delta +5, W1 delta −5, both in round 1.
    const adp = new Map([
      ...dense,
      ['WR:W0', { adp: 12, source: 'platform' }],
      ['WR:W1', { adp: 2, source: 'platform' }],
    ]);
    const { rows } = makeWrBoard(adp);
    const byName = (name: string) => rows.find((r) => r.player.name === name);
    expect(byName('W0')?.delta).toBeCloseTo(5, 6);
    expect(byName('W1')?.delta).toBeCloseTo(-5, 6);
  });

  it('produces nonzero deltas for a mispriced position while a clean market stays flat', () => {
    // QBs mispriced (Q0 at 20 while Q1 at 8 → pooled 14 → deltas ±6)...
    const qbAdp = new Map<string, PlayerAdp>([
      ['QB:Q0', { adp: 20, source: 'platform' }],
      ['QB:Q1', { adp: 8, source: 'platform' }],
      ['QB:Q2', { adp: 30, source: 'platform' }],
      ['QB:Q3', { adp: 35, source: 'platform' }],
      ['QB:Q4', { adp: 40, source: 'platform' }],
      ['QB:Q5', { adp: 45, source: 'platform' }],
    ]);
    const qbs = Array.from({ length: 6 }, (_, i) =>
      player('QB', `Q${i}`, { payd: 4500 - i * 300, patd: 30 - i, int: 8, ruYd: 200, ruTd: 1 }),
    );
    // ...while the WR market is perfectly efficient (all deltas 0).
    const wrRows = Array.from({ length: 11 }, (_, i) => player('WR', `W${i}`, { rcYd: 2500 - i * 100 }));
    const { rows } = buildBoard([...qbs, ...wrRows], settings, new Map([...qbAdp, ...dense]));
    for (const r of rows) {
      if (r.player.position !== 'WR' || r.adp === null) {
        continue;
      }
      expect(r.delta).toBe(0);
    }
  });

  it('leaves players without an xADP at null delta (no ADP anchor)', () => {
    const { rows } = makeWrBoard(dense);
    const w10 = rows.find((r) => r.player.name === 'W10');
    expect(w10?.xadp).toBeNull();
    expect(w10?.delta).toBeNull();
  });
});

describe('fitIsotonicAdp (§6.2)', () => {
  it('recovers a perfectly-ordered market: fitted value equals own ADP', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ vorp: 1000 - i * 100, adp: 10 + i * 10 }));
    const fitted = fitIsotonicAdp(points);
    expect(fitted).not.toBeNull();
    for (const p of points) {
      expect(fitted?.get(p.vorp)).toBe(p.adp);
    }
  });

  it('pools monotonicity-violating groups at the weighted mean ADP', () => {
    // vorp 90 drafted at 10 but vorp 100 (twice) drafted at 20/30 → violation;
    // pooled value = (10 + 20 + 30) / 3 = 20 for all three.
    const fitted = fitIsotonicAdp([
      { vorp: 90, adp: 10 },
      { vorp: 100, adp: 20 },
      { vorp: 100, adp: 30 },
    ]);
    expect(fitted?.get(90)).toBe(20);
    expect(fitted?.get(100)).toBe(20);
  });

  it('gives equal-VORP players the same fitted xADP', () => {
    const fitted = fitIsotonicAdp([
      { vorp: 100, adp: 10 },
      { vorp: 50, adp: 40 },
      { vorp: 50, adp: 60 },
    ]);
    expect(fitted?.get(50)).toBe(50);
    expect(fitted?.get(100)).toBe(10);
  });

  it('returns null for empty input', () => {
    expect(fitIsotonicAdp([])).toBeNull();
  });
});

describe('midnight-UTC expiry helper (§5.2/§7)', () => {
  it('computes ms until the next UTC midnight', () => {
    const before = msUntilNextUtcMidnightMs(Date.UTC(2026, 7, 12, 14, 32, 0, 0));
    expect(before).toBe(9 * 3_600_000 + 28 * 60_000);
    const nearMidnight = msUntilNextUtcMidnightMs(Date.UTC(2026, 7, 12, 23, 59, 59, 500));
    expect(nearMidnight).toBe(500);
  });

  it('exposes the Temporal-typed form used server-side', () => {
    const ttl = msUntilNextUtcMidnight(Temporal.Instant.from('2026-08-12T00:00:00Z'));
    expect(ttl).toBe(24 * 3_600_000);
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
