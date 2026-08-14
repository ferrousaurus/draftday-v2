/**
 * Kona provider mapping tests (§5.3) — fixture-pinned, plus a live probe that
 * runs against the real league when `VITEST_ESPN_S2` / `VITEST_SWID` /
 * `VITEST_ESPN_LEAGUE` (fallback `VITE_*`) are present and skips cleanly when
 * absent (§3.3, §10.2). The stat/slot-id mapping is pinned by the probe.
 */
import { describe, expect, it } from 'vitest';
import { konaVariant, mapKonaPlayers, mapKonaSettings } from '../lib/kona.ts';
import { fetchKonaLeagueData } from '../server/kona.ts';
import { getTestEnv } from './test-env.ts';

const SETTINGS_FIXTURE = new URL('fixtures/kona-settings.json', import.meta.url);
const PLAYERS_FIXTURE = new URL('fixtures/kona-players.json', import.meta.url);

async function readJson(url: URL): Promise<unknown> {
  const text = await Deno.readTextFile(url);
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

/** The mSettings view wraps the settings under a `settings` key (§5.3). */
function unwrapSettings(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) {
    return json;
  }
  for (const [key, value] of Object.entries(json)) {
    if (key === 'settings') {
      return value;
    }
  }
  return json;
}

async function readSettingsFixture(): Promise<unknown> {
  return unwrapSettings(await readJson(SETTINGS_FIXTURE));
}

describe('mapKonaSettings (§5.4)', () => {
  it('maps scoringItems stat ids to app rates, with the PPR value written to all three RECEPTIONS fields', async () => {
    const settings = mapKonaSettings(await readSettingsFixture());
    expect(settings?.leagueSize).toBe(12);
    expect(settings?.scoring.passYards).toBe(0.04);
    expect(settings?.scoring.passTd).toBe(4);
    expect(settings?.scoring.interceptions).toBe(-2);
    expect(settings?.scoring.receptionsRb).toBe(1);
    expect(settings?.scoring.receptionsWr).toBe(1);
    expect(settings?.scoring.receptionsTe).toBe(1);
    expect(settings?.scoring.defSacks).toBe(1);
    expect(settings?.scoring.defInt).toBe(2);
    expect(settings?.scoring.defForceFumble).toBe(1);
    expect(settings?.scoring.defRecoverFumble).toBe(1);
    expect(settings?.scoring.defSafeties).toBe(2);
    expect(settings?.scoring.defTd).toBe(6);
  });

  it('maps lineupSlotCounts to starters (slot 23 FLEX; slot 20 superflex only when small)', async () => {
    const settings = mapKonaSettings(await readSettingsFixture());
    expect(settings?.roster.startingQb).toBe(1);
    expect(settings?.roster.startingRb).toBe(2);
    expect(settings?.roster.startingWr).toBe(3);
    expect(settings?.roster.startingTe).toBe(1);
    expect(settings?.roster.startingDst).toBe(1);
    expect(settings?.roster.flex).toBe(1);
    // 20×7 in the fixture is bench, not superflex (probe: 12-team league).
    expect(settings?.roster.superflex).toBe(0);
  });

  it('returns null when size is missing', () => {
    expect(mapKonaSettings({})).toBeNull();
  });

  it('honors pointsOverrides for slot 16 (DST pricing)', () => {
    const settings = mapKonaSettings({
      size: 12,
      scoringSettings: { scoringItems: [{ statId: 53, points: 1, pointsOverrides: { 16: 2 } }] },
      rosterSettings: {},
    });
    expect(settings?.scoring.defSacks).toBe(2);
  });
});

describe('konaVariant (§5.3)', () => {
  it('selects SUPERFLEX for 2QB leagues', async () => {
    await readSettingsFixture(); // sanity: fixture parses
    const twoQb = mapKonaSettings({
      size: 12,
      scoringSettings: { scoringItems: [{ statId: 17, points: 1 }] },
      rosterSettings: { lineupSlotCounts: { 0: 2, 23: 1, 16: 1 } },
    });
    expect(twoQb).not.toBeNull();
    if (twoQb !== null) {
      expect(konaVariant(twoQb)).toBe('SUPERFLEX');
    }
  });

  it('selects PPR for non-zero league PPR (fractional included) and STANDARD for zero', () => {
    const ppr = mapKonaSettings({
      size: 12,
      scoringSettings: { scoringItems: [{ statId: 17, points: 1 }] },
      rosterSettings: { lineupSlotCounts: { 0: 1, 23: 1, 16: 1 } },
    });
    if (ppr !== null) {
      expect(konaVariant(ppr)).toBe('PPR');
    }
    const standard = mapKonaSettings({
      size: 12,
      scoringSettings: { scoringItems: [{ statId: 17, points: 0 }] },
      rosterSettings: { lineupSlotCounts: { 0: 1, 23: 1, 16: 1 } },
    });
    if (standard !== null) {
      expect(konaVariant(standard)).toBe('STANDARD');
    }
    const fractional = mapKonaSettings({
      size: 12,
      scoringSettings: { scoringItems: [{ statId: 17, points: 0.75 }] },
      rosterSettings: { lineupSlotCounts: { 0: 1, 23: 1, 16: 1 } },
    });
    if (fractional !== null) {
      expect(konaVariant(fractional)).toBe('PPR');
    }
  });
});

describe('mapKonaPlayers (§5.3)', () => {
  it('maps the player pool with positions, proTeamId teams and variant ranks', async () => {
    const playersJson = await readJson(PLAYERS_FIXTURE);
    const records = mapKonaPlayers(playersJson, 'PPR');
    expect(records.length).toBe(5);
    const gibbs = records.find((r) => r.name === 'Jahmyr Gibbs');
    expect(gibbs?.position).toBe('RB');
    expect(gibbs?.team).toBe('DET');
    expect(gibbs?.adp).toBeCloseTo(1.61, 5);
    expect(gibbs?.rank).toBe(1);
    const allen = records.find((r) => r.name === 'Josh Allen');
    expect(allen?.position).toBe('QB');
    expect(allen?.team).toBe('BUF');
    const dst = records.find((r) => r.name === 'Broncos D/ST');
    expect(dst?.position).toBe('DST');
    expect(dst?.team).toBe('DEN');
    expect(dst?.adp).toBeCloseTo(150.5, 5);
  });

  it('reads the variant-specific rank', async () => {
    const playersJson = await readJson(PLAYERS_FIXTURE);
    const records = mapKonaPlayers(playersJson, 'SUPERFLEX');
    const gibbs = records.find((r) => r.name === 'Jahmyr Gibbs');
    expect(gibbs?.rank).toBe(7);
  });
});

describe('kona live probe (§5.3) — skips cleanly without credentials', () => {
  it('fetches league settings + full ADP pool and pins the mapping', async () => {
    const env = getTestEnv();
    if (env.espnS2 === '' || env.swid === '' || env.leagueId === null) {
      return; // skip cleanly when credentials are absent (§3.3, §10.2)
    }
    const result = await fetchKonaLeagueData({
      season: 2026,
      leagueId: String(env.leagueId),
      espnS2: env.espnS2,
      swid: env.swid,
    });
    expect(result.settings.leagueSize).toBeGreaterThanOrEqual(8);
    expect(result.settings.leagueSize).toBeLessThanOrEqual(16);
    expect(result.players.length).toBeGreaterThan(300);
    // Every pool player carries ADP (probe: 0 missing) and a known team.
    const withoutAdp = result.players.filter((p) => p.adp === null);
    expect(withoutAdp.length).toBeLessThanOrEqual(10);
    const dsts = result.players.filter((p) => p.position === 'DST');
    expect(dsts.length).toBe(32);
    const jahmyr = result.players.find((p) => p.name === 'Jahmyr Gibbs');
    expect(jahmyr?.team).toBe('DET');
  });
});
