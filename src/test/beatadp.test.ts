/**
 * BeatADP HTML parser tests (§5.2) against the trimmed real-page fixture.
 * Pins: row/cell extraction, entity decoding, `—` → null, consensus fallback,
 * and the empty-page (unsupported combination) → null rule.
 */
import { type ParsedBeatAdpRow, parseBeatAdpHtml, platformValue, toAdpRecords } from '../lib/beatadp-html.ts';
import { describe, expect, it } from 'vitest';

const FIXTURE = new URL('fixtures/beatadp-sample.html', import.meta.url);

async function parseFixture() {
  const html = await Deno.readTextFile(FIXTURE);
  const table = parseBeatAdpHtml(html);
  if (table === null) {
    throw new Error('fixture parsed to null');
  }
  return table;
}

describe('parseBeatAdpHtml', () => {
  it('parses the header + first rows of the real page', async () => {
    const table = await parseFixture();
    expect(table.rows.length).toBeGreaterThanOrEqual(48);
    const [first] = table.rows;
    expect(first?.name).toBe('Jahmyr Gibbs');
    expect(first?.team).toBe('DET');
    expect(first?.consensus).toBeCloseTo(1.9, 1);
    expect(first?.sleeper).toBeCloseTo(2.3, 1);
    expect(first?.espn).toBeNull(); // ESPN has no ADP for the top rows in the real page
    expect(first?.yahoo).toBeCloseTo(1.6, 1);
    expect(first?.underdog).toBeNull();
    expect(first?.fantasyPros).toBeCloseTo(1.8, 1);
  });

  it('decodes HTML entities in player names', async () => {
    const table = await parseFixture();
    const chase = table.rows.find((r) => r.name === "Ja'Marr Chase");
    expect(chase).toBeDefined();
  });

  it('normalizes team codes to the internal mapping (WSH included)', async () => {
    const table = await parseFixture();
    const wsh = table.rows.find((r) => r.team === 'WSH');
    expect(wsh).toBeDefined();
    expect(table.rows.some((r) => r.team === 'WAS')).toBe(false);
  });

  it('returns null for a page with no player rows (unsupported combination)', () => {
    const html = '<html><body><main>No ADP data found for the selected filters.</main></body></html>';
    expect(parseBeatAdpHtml(html)).toBeNull();
  });

  it('handles free agents without a team span', async () => {
    const table = await parseFixture();
    // Sterling Shepard has no team span in the real page.
    const row = table.rows.find((r) => r.name === 'Sterling Shepard');
    if (row !== undefined) {
      expect(row.team).toBeNull();
    }
  });
});

describe('platformValue + consensus fallback', () => {
  const row: ParsedBeatAdpRow = {
    name: 'Test Player',
    team: 'DET',
    consensus: 30,
    sleeper: null,
    espn: null,
    yahoo: 25,
    underdog: null,
    fantasyPros: null,
  };

  it('selects the platform column when present', () => {
    expect(platformValue(row, 'Yahoo')).toEqual({ adp: 25, source: 'platform' });
  });

  it('falls back to Consensus with the consensus tag when the platform column is missing', () => {
    expect(platformValue(row, 'Sleeper')).toEqual({ adp: 30, source: 'consensus' });
  });

  it('yields null when Consensus is also missing', () => {
    const empty: ParsedBeatAdpRow = { ...row, consensus: null };
    expect(platformValue(empty, 'Sleeper')).toEqual({ adp: null, source: 'consensus' });
  });

  it('toAdpRecords carries the fallback source tag', () => {
    const table = { rows: [row] };
    const records = toAdpRecords(table, 'Sleeper');
    expect(records[0]?.adp).toBe(30);
    expect(records[0]?.source).toBe('consensus');
    const yahoo = toAdpRecords(table, 'Yahoo');
    expect(yahoo[0]?.source).toBe('platform');
  });
});
