/**
 * Sleeper league mapping tests (§5.4): scoring keys, starters, league type
 * (best_ball → BEST_BALL, keeper → REDRAFT).
 */
import { describe, expect, it } from 'vitest';
import { mapSleeperLeague } from '../lib/sleeper.ts';

const FIXTURE = new URL('fixtures/sleeper-league.json', import.meta.url);

async function readFixture(): Promise<unknown> {
  const text = await Deno.readTextFile(FIXTURE);
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

describe('mapSleeperLeague', () => {
  it('maps scoring keys, starters and best_ball type', async () => {
    const settings = mapSleeperLeague(await readFixture());
    expect(settings?.leagueSize).toBe(12);
    expect(settings?.draftType).toBe('BEST_BALL');
    expect(settings?.scoring.passYards).toBe(0.04);
    expect(settings?.scoring.receptionsTe).toBe(1);
    expect(settings?.roster.startingQb).toBe(1);
    expect(settings?.roster.startingRb).toBe(2);
    expect(settings?.roster.startingWr).toBe(2);
    expect(settings?.roster.startingTe).toBe(1);
    expect(settings?.roster.flex).toBe(1);
    expect(settings?.roster.superflex).toBe(1);
    expect(settings?.roster.startingDst).toBe(1);
  });

  it('maps keeper → REDRAFT and dynasty → DYNASTY', () => {
    const keeper = mapSleeperLeague({ type: 'keeper', total_rosters: 10, settings: { scoring: {} } });
    expect(keeper?.draftType).toBe('REDRAFT');
    const dynasty = mapSleeperLeague({ type: 'dynasty', total_rosters: 12, settings: { scoring: {} } });
    expect(dynasty?.draftType).toBe('DYNASTY');
  });

  it('returns null when total_rosters is missing, defaults when scoring is absent', () => {
    expect(mapSleeperLeague({})).toBeNull();
    const defaults = mapSleeperLeague({ total_rosters: 12 });
    expect(defaults?.leagueSize).toBe(12);
    expect(defaults?.scoring.passYards).toBe(0.04); // sleeperDefaultScoring fallback
  });

  it('defaults 1QB derivation from starters', () => {
    const oneQb = mapSleeperLeague({
      type: 'redraft',
      total_rosters: 12,
      settings: { scoring: {}, roster: { starters: ['QB', 'RB', 'WR', 'TE', 'DEF'] } },
    });
    expect(oneQb?.roster.superflex).toBe(0);
    const twoQb = mapSleeperLeague({
      type: 'redraft',
      total_rosters: 12,
      settings: { scoring: {}, roster: { starters: ['QB', 'QB', 'RB', 'WR', 'TE', 'DEF'] } },
    });
    expect(twoQb?.roster.startingQb).toBe(2);
  });
});
