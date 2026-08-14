/**
 * Parser tests against the committed synthetic fixture (§3.3): a small
 * hand-built xlsx exercising all seven parsed sheets, the DST stat merge,
 * `WAS`/`WSH` unification, opaque `Player ID` provenance, and placeholder rows.
 */
import { describe, expect, it } from 'vitest';
import { parseWorkbook } from '../lib/workbook/parser.ts';

const FIXTURE = new URL('fixtures/synthetic.xlsx', import.meta.url);

async function parseFixture() {
  const bytes = await Deno.readFile(FIXTURE);
  return parseWorkbook(bytes);
}

describe('parseWorkbook (synthetic fixture)', () => {
  it('parses all seven sheets into one player table', async () => {
    const players = await parseFixture();
    expect(players.length).toBe(10); // 2 QB + 2 RB + 3 WR + 1 TE + 2 DST
    expect(players.map((p) => p.position).sort()).toEqual(
      ['DST', 'DST', 'QB', 'QB', 'RB', 'RB', 'TE', 'WR', 'WR', 'WR'].sort(),
    );
  });

  it('reads cached stat values and Custom points', async () => {
    const players = await parseFixture();
    const allen = players.find((p) => p.name === 'Josh Allen');
    expect(allen?.team).toBe('BUF');
    expect(allen?.bye).toBe(12);
    expect(allen?.rawStats.payd).toBeCloseTo(4200, 6);
    expect(allen?.rawStats.patd).toBe(36);
    expect(allen?.filePoints).toBeCloseTo(329, 6); // 4200×0.04 + 36×4 − 10×2 + 250×0.1 + 2×6
    const chase = players.find((p) => p.name === "Ja'Marr Chase");
    expect(chase?.rawStats.rec).toBe(108);
  });

  it('skips placeholder rows (Player "0")', async () => {
    const players = await parseFixture();
    expect(players.filter((p) => p.name === '0')).toHaveLength(0);
  });

  it('merges DST stat projections from the visible DST sheet by ABBREV', async () => {
    const players = await parseFixture();
    const ari = players.find((p) => p.position === 'DST' && p.team === 'ARI');
    expect(ari?.name).toBe('Arizona Cardinals');
    expect(ari?.rawStats.sacks).toBe(41);
    expect(ari?.rawStats.defInt).toBe(14);
    expect(ari?.rawStats.ff).toBe(12);
    expect(ari?.rawStats.fr).toBe(8);
    expect(ari?.rawStats.saf).toBe(1);
    expect(ari?.rawStats.defTd).toBe(2);
    expect(ari?.filePoints).toBeCloseTo(103, 6);
  });

  it('normalizes WAS → WSH and keeps the master team authoritative', async () => {
    const players = await parseFixture();
    const mclaurin = players.find((p) => p.name === 'Terry McLaurin');
    expect(mclaurin?.team).toBe('WSH');
  });

  it('attaches opaque Player IDs from the Rankings sheet', async () => {
    const players = await parseFixture();
    const allen = players.find((p) => p.name === 'Josh Allen');
    expect(allen?.playerId).toBe(17_298);
    const dst = players.find((p) => p.position === 'DST');
    expect(dst?.playerId).toBeNull();
    expect(players.every((p) => p.ref >= 1)).toBe(true);
  });

  it('builds stable per-file ids', async () => {
    const players = await parseFixture();
    const ids = new Set(players.map((p) => p.id));
    expect(ids.has('QB:Josh Allen')).toBe(true);
    expect(ids.has("WR:Ja'Marr Chase")).toBe(true);
    expect(ids.has('DST:Arizona Cardinals')).toBe(true);
  });
});
