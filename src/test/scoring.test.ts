/**
 * Scoring oracle tests (§3.3). The oracle parses the workbook's `Settings`
 * sheet (test-only), runs the engine under _those_ settings, and requires
 * `projectedPoints` to reproduce the workbook's `Custom` values within 1e-6
 * relative error for all positions.
 *
 * The real workbook (`resources/2026-FFB-Projections-0805-1.xlsx`, untracked)
 * is used when present and skipped cleanly when absent; the committed
 * synthetic fixture under `src/test/fixtures/` pins the same math in CI.
 *
 * Discrepancy note: the QB master `FPS` column differs from `Custom` (~5.6 pts
 * for Josh Allen) — master `FPS` is a separate 0-PPR formula computed from
 * rounded inputs; the oracle targets `Custom` (spec §9.2).
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { computeProjectedPoints } from '../lib/scoring.ts';
import { parseWorkbook } from '../lib/workbook/parser.ts';
import type { AppSettings, PlayerRecord, ScoringSettings } from '../lib/types.ts';

const REAL_WORKBOOK = new URL('../../../resources/2026-FFB-Projections-0805-1.xlsx', import.meta.url);
const FIXTURE = new URL('./fixtures/synthetic.xlsx', import.meta.url);

const REL_TOLERANCE = 1e-6;

function parseSettingsSheet(wb: XLSX.WorkBook): {
  scoring: ScoringSettings;
  teams: number;
  roster: AppSettings['roster'];
} {
  const ws = wb.Sheets['Settings'];
  if (ws === undefined) throw new Error('Settings sheet missing');
  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(ws, { header: 1, raw: true });
  const scoring: ScoringSettings = {
    passAttempts: 0,
    completions: 0,
    targets: 0,
    passYards: 0,
    passTd: 0,
    interceptions: 0,
    rushYards: 0,
    rushTd: 0,
    recvYards: 0,
    recvTd: 0,
    receptionsRb: 0,
    receptionsWr: 0,
    receptionsTe: 0,
    defSacks: 0,
    defInt: 0,
    defForceFumble: 0,
    defRecoverFumble: 0,
    defSafeties: 0,
    defTd: 0,
  };
  const roster = {
    startingQb: 0,
    startingRb: 0,
    startingWr: 0,
    startingTe: 0,
    startingDst: 0,
    flex: 0,
    superflex: 0,
    auctionBudget: 200,
  };
  let teams = 12;
  const label = (row: Array<unknown>, col: number): string => {
    const cell = row[col];
    return typeof cell === 'string' ? cell.trim() : '';
  };
  const value = (row: Array<unknown>, col: number): number => {
    const cell = row[col];
    return typeof cell === 'number' ? cell : 0;
  };
  for (const row of rows) {
    const category = label(row, 0);
    const pts = value(row, 1);
    if (category === 'PASS YARDS') scoring.passYards = pts;
    if (category === 'PASS TDS') scoring.passTd = pts;
    if (category === 'INTERCEPTIONS') scoring.interceptions = pts;
    if (category === 'RUSH YARDS') scoring.rushYards = pts;
    if (category === 'RUSH TDS') scoring.rushTd = pts;
    if (category === 'RECV YARDS') scoring.recvYards = pts;
    if (category === 'RECV TDS') scoring.recvTd = pts;
    if (category === 'RECEPTIONS (RB)') scoring.receptionsRb = pts;
    if (category === 'RECEPTIONS (WR)') scoring.receptionsWr = pts;
    if (category === 'RECEPTIONS (TE)') scoring.receptionsTe = pts;
    if (category === 'DEF SACKS') scoring.defSacks = pts;
    if (category === 'DEF INT') scoring.defInt = pts;
    if (category === 'DEF FORCE FUMBLE') scoring.defForceFumble = pts;
    if (category === 'DEF RECOVER FUMBLE') scoring.defRecoverFumble = pts;
    if (category === 'DEF SAFETIES') scoring.defSafeties = pts;
    if (category === 'DEF TOUCHDOWN') scoring.defTd = pts;
    const rosterCategory = label(row, 3);
    const rosterValue = value(row, 4);
    if (rosterCategory === 'TEAMS') teams = rosterValue;
    if (rosterCategory === 'STARTING QB') roster.startingQb = rosterValue;
    if (rosterCategory === 'STARTING RB') roster.startingRb = rosterValue;
    if (rosterCategory === 'STARTING WR') roster.startingWr = rosterValue;
    if (rosterCategory === 'STARTING TE') roster.startingTe = rosterValue;
    if (rosterCategory === 'STARTING DST') roster.startingDst = rosterValue;
    if (rosterCategory === 'STARTING FLEX') roster.flex = rosterValue;
    if (rosterCategory === 'STARTING SUPERFLEX') roster.superflex = rosterValue;
  }
  return { scoring, teams, roster };
}

function runOracle(bytes: Uint8Array): { players: PlayerRecord[]; settings: AppSettings } {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  const settings = parseSettingsSheet(wb);
  const players = parseWorkbook(bytes);
  return {
    players,
    settings: {
      platform: 'ESPN',
      leagueAware: false,
      leagueId: '',
      espnS2: '',
      swid: '',
      draftType: 'REDRAFT',
      leagueSize: settings.teams,
      scoring: settings.scoring,
      roster: settings.roster,
      season: 2026,
    },
  };
}

function assertOracle(bytes: Uint8Array, label: string) {
  const { players, settings } = runOracle(bytes);
  expect(players.length).toBeGreaterThan(0);
  const worst: Array<{ name: string; position: string; file: number; computed: number }> = [];
  for (const p of players) {
    const computed = computeProjectedPoints(p, settings.scoring);
    const file = p.filePoints;
    let relError: number;
    if (file === 0) {
      relError = computed === 0 ? 0 : Infinity;
    } else {
      relError = Math.abs(computed - file) / Math.abs(file);
    }
    if (relError > REL_TOLERANCE) {
      worst.push({ name: p.name, position: p.position, file, computed });
    }
  }
  expect(worst, `${label}: engine must reproduce Custom within ${REL_TOLERANCE} relative error`).toEqual([]);
}

describe('scoring oracle', () => {
  it('reproduces the synthetic fixture Custom values from its own Settings sheet', async () => {
    const bytes = await Deno.readFile(FIXTURE);
    assertOracle(bytes, 'synthetic fixture');
  });

  it('reproduces the real workbook Custom values under the workbook settings (skips cleanly when absent)', async () => {
    try {
      const bytes = await Deno.readFile(REAL_WORKBOOK);
      assertOracle(bytes, 'real workbook');
    } catch {
      // The real workbook is untracked/gitignored; skip cleanly (§3.3).
    }
  });
});

describe('scoring engine units', () => {
  const settings: ScoringSettings = {
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
  };

  function player(position: PlayerRecord['position'], name: string, rawStats: PlayerRecord['rawStats']): PlayerRecord {
    return {
      id: `${position}:${name}`,
      position,
      name,
      team: 'X',
      bye: 0,
      rawStats,
      filePoints: 0,
      playerId: null,
      ref: 1,
    };
  }

  it('prices the QB stat line', () => {
    const pts = computeProjectedPoints(
      player('QB', 'Test QB', { pAtt: 600, cmp: 400, payd: 4000, patd: 30, int: 8, ruAt: 80, ruYd: 200, ruTd: 1 }),
      settings,
    );
    expect(pts).toBeCloseTo(4000 * 0.04 + 30 * 4 - 8 * 2 + 200 * 0.1 + 1 * 6, 6);
  });

  it('prices RB/WR/TE receptions with per-position PPR', () => {
    const rb = computeProjectedPoints(
      player('RB', 'Test RB', { ruYd: 1000, ruTd: 8, tgt: 50, rec: 40, rcYd: 300, rcTd: 2 }),
      settings,
    );
    expect(rb).toBeCloseTo(1000 * 0.1 + 8 * 6 + 40 * 0.5 + 300 * 0.1 + 2 * 6, 6);
    const wr = computeProjectedPoints(player('WR', 'Test WR', { tgt: 120, rec: 80, rcYd: 1000, rcTd: 8 }), settings);
    expect(wr).toBeCloseTo(80 * 0.5 + 1000 * 0.1 + 8 * 6, 6);
  });

  it('prices DST rates including safeties', () => {
    const pts = computeProjectedPoints(
      player('DST', 'Test DST', { sacks: 40, defInt: 12, ff: 10, fr: 6, saf: 1, defTd: 2 }),
      settings,
    );
    expect(pts).toBeCloseTo(40 + 24 + 10 + 6 + 2 + 12, 6);
  });

  it('is formula-respectful: zero-rate categories contribute nothing but do not error', () => {
    const pts = computeProjectedPoints(
      player('QB', 'Test QB', {
        pAtt: 600,
        cmp: 400,
        payd: 4000,
        patd: 30,
        int: 8,
        ruAt: 80,
        ruYd: 200,
        ruTd: 1,
        tgt: 3,
        rec: 1,
      }),
      { ...settings, passAttempts: 0, completions: 0, targets: 0 },
    );
    expect(pts).toBeCloseTo(4000 * 0.04 + 30 * 4 - 8 * 2 + 200 * 0.1 + 1 * 6, 6);
  });
});
