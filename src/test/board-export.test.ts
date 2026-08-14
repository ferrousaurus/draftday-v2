/**
 * Board CSV export tests: column layout, RFC 4180 escaping, nulls-last sort
 * semantics matching BoardTable (§6.4), and the drafted flag.
 */
import { describe, expect, it } from 'vitest';
import type { BoardPlayer } from '../lib/types.ts';
import { boardToCsv } from '../lib/board-export.ts';

function row(name: string, opts: Partial<BoardPlayer> = {}): BoardPlayer {
  return {
    player: {
      id: `id:${name}`,
      position: 'RB',
      name,
      team: 'X',
      bye: 0,
      rawStats: {},
      filePoints: 100,
      playerId: null,
      ref: 1,
    },
    projectedPoints: 100,
    vorp: 10,
    adp: null,
    adpSource: null,
    xadp: null,
    delta: null,
    ...opts,
  };
}

function playerNames(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/u, '')
    .split('\r\n')
    .slice(1)
    .map((line) => line.split(',')[1] ?? '');
}

describe('boardToCsv content', () => {
  it('writes a BOM-prefixed header and one row per player, with CRLF line endings', () => {
    const csv = boardToCsv([row('Lamb')], null, new Set(), new Map());
    expect(csv.startsWith('\uFEFFADP,Name,Pos,Team,Proj Pts,VORP,xADP,Delta,Drafted,Flag\r\n')).toBe(true);
    expect(csv).toContain('\r\n,Lamb,RB,X,100.0,10.0,,,N,');
  });

  it('formats ADP/xADP/delta to one decimal, leaves nulls empty, and flags drafted players', () => {
    const r = row('Lamb', { adp: 12.34, xadp: 15.678, delta: -3.338 });
    const csv = boardToCsv([r], null, new Set([r.player.id]), new Map());
    expect(csv).toContain('12.3,Lamb,RB,X,100.0,10.0,15.7,-3.3,Y,');
  });

  it('exports delta as a plain number without a plus sign', () => {
    const r = row('Lamb', { adp: 10, xadp: 5, delta: 5 });
    expect(boardToCsv([r], null, new Set(), new Map())).toContain('10.0,5.0,5.0,N,');
  });

  it('emits Steal / Reach / empty for the Flag column', () => {
    const steal = row('CeeDee', { adp: 10, xadp: 15, delta: -5 });
    const reach = row('JaMarr', { adp: 25, xadp: 20, delta: 5 });
    const unflagged = row('Amon', { adp: 30, xadp: 30, delta: 0 });
    const flags = new Map([
      [steal.player.id, 'steal'],
      [reach.player.id, 'reach'],
    ] as const);
    const csv = boardToCsv([steal, reach, unflagged], null, new Set(), flags);
    expect(csv).toContain(',CeeDee,RB,X,100.0,10.0,15.0,-5.0,N,Steal');
    expect(csv).toContain(',JaMarr,RB,X,100.0,10.0,20.0,5.0,N,Reach');
    expect(csv).toContain(',Amon,RB,X,100.0,10.0,30.0,0.0,N,');
  });

  it('quotes fields containing commas or quotes, doubling embedded quotes', () => {
    const weird = row('Weird', {
      player: {
        id: 'id:Weird',
        position: 'RB',
        name: 'Smith, "Heavy"',
        team: 'X',
        bye: 0,
        rawStats: {},
        filePoints: 100,
        playerId: null,
        ref: 1,
      },
    });
    const csv = boardToCsv([weird], null, new Set(), new Map());
    expect(csv).toContain(',"Smith, ""Heavy""",RB,X,');
  });
});

describe('boardToCsv sorting', () => {
  it('sorts by column and direction, matching the visible table', () => {
    const rows = [row('Cousins', { adp: 30 }), row('Allen', { adp: 20 }), row('Baker', { adp: 10 })];
    const asc = playerNames(boardToCsv(rows, { id: 'name', desc: false }, new Set(), new Map()));
    expect(asc).toEqual(['Allen', 'Baker', 'Cousins']);
    const desc = playerNames(boardToCsv(rows, { id: 'name', desc: true }, new Set(), new Map()));
    expect(desc).toEqual(['Cousins', 'Baker', 'Allen']);
  });

  it('sorts numbers numerically', () => {
    const rows = [
      row('A', { projectedPoints: 120 }),
      row('B', { projectedPoints: 200 }),
      row('C', { projectedPoints: 90 }),
    ];
    const names = playerNames(boardToCsv(rows, { id: 'projectedPoints', desc: true }, new Set(), new Map()));
    expect(names).toEqual(['B', 'A', 'C']);
  });

  it('keeps nulls last for adp/xadp/delta in both directions (§6.4)', () => {
    const rows = [
      row('NullAdp', { adp: null }),
      row('Late', { adp: 50, xadp: 60, delta: -10 }),
      row('Early', { adp: 5, xadp: 3, delta: 2 }),
    ];
    for (const desc of [false, true]) {
      const names = playerNames(boardToCsv(rows, { id: 'adp', desc }, new Set(), new Map()));
      expect(names).toEqual(desc ? ['Late', 'Early', 'NullAdp'] : ['Early', 'Late', 'NullAdp']);
    }
  });

  it('leaves rows in original order for an unknown sort column', () => {
    const rows = [row('B'), row('A')];
    const names = playerNames(boardToCsv(rows, { id: 'bogus', desc: false }, new Set(), new Map()));
    expect(names).toEqual(['B', 'A']);
  });
});
