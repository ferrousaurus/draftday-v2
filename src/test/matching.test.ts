/**
 * Matching tests (§4): normalization (punctuation, suffixes, diacritics),
 * team-code unification (WAS → WSH, full names, nicknames, ESPN proTeamId),
 * exact (name, team) preference, and the (name, position) fallback.
 */
import type { AdpRecord, PlayerRecord } from '../lib/types.ts';
import { describe, expect, it } from 'vitest';
import { matchAdp, normalizeName, teamOfCodeOrId } from '../lib/matching.ts';
import { normalizeDefenseName, normalizeTeam, teamByProTeamId, teamInfo } from '../lib/teams.ts';

describe('normalizeName (§4)', () => {
  it('strips punctuation, suffixes and diacritics, and case-folds', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarrchase');
    expect(normalizeName('A.J. Brown')).toBe('ajbrown');
    expect(normalizeName('Travis Etienne Jr.')).toBe('travisetienne');
    expect(normalizeName('Marvin Harrison Jr')).toBe('marvinharrison');
    expect(normalizeName('Mark Andrews II')).toBe('markandrews');
    expect(normalizeName('José Ramírez')).toBe('joseramirez');
  });
});

describe('team mapping (§4)', () => {
  it('unifies WAS/WSH and resolves 3-letter codes', () => {
    expect(normalizeTeam('WSH')).toBe('WSH');
    expect(normalizeTeam('WAS')).toBe('WSH');
    expect(normalizeTeam('ARI')).toBe('ARI');
    expect(normalizeTeam('kc')).toBe('KC');
  });

  it('resolves full names, cities and nicknames', () => {
    expect(normalizeTeam('Arizona Cardinals')).toBe('ARI');
    expect(normalizeTeam('Kansas City')).toBe('KC');
    expect(normalizeTeam('49ers')).toBe('SF');
    expect(normalizeTeam('Washington Commanders')).toBe('WSH');
  });

  it('maps ESPN proTeamId classic numbering', () => {
    expect(teamByProTeamId(1)).toBe('ATL');
    expect(teamByProTeamId(2)).toBe('BUF');
    expect(teamByProTeamId(8)).toBe('DET');
    expect(teamByProTeamId(22)).toBe('ARI');
    expect(teamByProTeamId(34)).toBe('HOU');
    expect(teamByProTeamId(999)).toBeNull();
    expect(teamOfCodeOrId('', 25)).toBe('SF');
    expect(teamOfCodeOrId('LV')).toBe('LV');
  });

  it('resolves defense names (nickname D/ST and full names)', () => {
    expect(normalizeDefenseName('Broncos D/ST')).toBe('DEN');
    expect(normalizeDefenseName('Cardinals D/ST')).toBe('ARI');
    expect(normalizeDefenseName('Arizona Cardinals')).toBe('ARI');
    expect(normalizeDefenseName('Broncos D/ST', 'DEN')).toBe('DEN');
    expect(normalizeDefenseName('Broncos D/ST', 'ARI')).toBeNull();
    expect(teamInfo('DEN')?.full).toBe('Denver Broncos');
  });
});

describe('matchAdp (§4)', () => {
  const workbook: PlayerRecord[] = [
    {
      id: 'QB:Josh Allen',
      position: 'QB',
      name: 'Josh Allen',
      team: 'BUF',
      bye: 12,
      rawStats: {},
      filePoints: 0,
      playerId: null,
      ref: 1,
    },
    {
      id: "WR:Ja'Marr Chase",
      position: 'WR',
      name: "Ja'Marr Chase",
      team: 'CIN',
      bye: 12,
      rawStats: {},
      filePoints: 0,
      playerId: null,
      ref: 2,
    },
    {
      id: 'TE:Brock Bowers',
      position: 'TE',
      name: 'Brock Bowers',
      team: 'LV',
      bye: 10,
      rawStats: {},
      filePoints: 0,
      playerId: null,
      ref: 3,
    },
    {
      id: 'DST:Arizona Cardinals',
      position: 'DST',
      name: 'Arizona Cardinals',
      team: 'ARI',
      bye: 14,
      rawStats: {},
      filePoints: 0,
      playerId: null,
      ref: 4,
    },
  ];

  const records: AdpRecord[] = [
    { key: 'Josh Allen', name: 'Josh Allen', team: 'BUF', position: null, adp: 12.4, source: 'platform' },
    { key: "Ja'Marr Chase", name: "Ja'Marr Chase", team: 'CIN', position: null, adp: 4.2, source: 'platform' },
    { key: 'Brock Bowers', name: 'Brock Bowers', team: 'LV', position: null, adp: 22.7, source: 'consensus' },
    { key: 'Cardinals D/ST', name: 'Cardinals D/ST', team: 'ARI', position: 'DST', adp: 150, source: 'league' },
  ];

  it('matches workbook players to provider records by normalized name + team', () => {
    const matched = matchAdp(workbook, records);
    expect(matched.get('QB:Josh Allen')).toEqual({ adp: 12.4, source: 'platform' });
    expect(matched.get("WR:Ja'Marr Chase")?.adp).toBe(4.2);
    expect(matched.get('TE:Brock Bowers')?.source).toBe('consensus');
    expect(matched.get('DST:Arizona Cardinals')?.adp).toBe(150);
  });

  it('leaves unresolved players with adp null', () => {
    const extra: PlayerRecord = {
      id: 'QB:Mystery QB',
      position: 'QB',
      name: 'Mystery QB',
      team: 'X',
      bye: 0,
      rawStats: {},
      filePoints: 0,
      playerId: null,
      ref: 9,
    };
    const matched = matchAdp([extra], records);
    expect(matched.get('QB:Mystery QB')?.adp).toBeNull();
  });

  it('prefers the position-matching record when a name+team key collides', () => {
    const allen = workbook.find((p) => p.id === 'QB:Josh Allen');
    if (allen === undefined) {
      throw new Error('fixture player missing');
    }
    const colliding: AdpRecord[] = [
      { key: 'QB:Josh Allen', name: 'Josh Allen', team: 'BUF', position: 'QB', adp: 10, source: 'platform' },
      { key: 'TE:Josh Allen', name: 'Josh Allen', team: 'BUF', position: 'TE', adp: 999, source: 'platform' },
    ];
    const matched = matchAdp([allen], colliding);
    expect(matched.get('QB:Josh Allen')?.adp).toBe(10);
  });
});
