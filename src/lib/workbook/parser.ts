/**
 * Workbook parser — reads exactly the seven sheets defined in spec §3.1 from an
 * uploaded Athletic projections workbook (format reference:
 * `.agents/skills/reading-athletic-projections/SKILL.md`).
 *
 * Reads cached cell values only; never recomputes formulas. Percentages are
 * decimal fractions, BYE weeks are integers, `#N/A` cached cells are absent.
 */
import * as XLSX from '@e965/xlsx';
import type { PlayerRecord, Position, RawStats } from '../types.ts';
import { normalizeTeam } from '../teams.ts';

type Sheet = XLSX.WorkSheet;

const NA_CELLS = new Set(['#N/A', '#REF!', '#VALUE!']);

function cellToNum(v: unknown): number {
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'string') {
    if (NA_CELLS.has(v)) {
      return 0;
    }
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  return 0;
}

function cellToStr(v: unknown): string {
  if (typeof v === 'string') {
    return NA_CELLS.has(v) ? '' : v.trim();
  }
  if (typeof v === 'number') {
    return String(v);
  }
  return '';
}

/** A player row is skipped when Player is empty, `"0"`, or a placeholder (§3.1). */
function isSkippedName(name: string): boolean {
  const n = name.trim();
  return n === '' || n === '0' || /^\d+$/u.test(n);
}

function rowsOf(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws: Sheet | undefined = wb.Sheets[sheetName];
  if (ws === undefined) {
    return [];
  }
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: undefined });
}

type MasterSpec = {
  position: Position;
  nameCol: number;
  teamCol: number;
  byeCol: number;
  stats: readonly [keyof RawStats, number][];
  customCol: number;
  refCol: number;
};

const MASTER_SPECS: readonly { sheet: string; spec: MasterSpec }[] = [
  {
    sheet: 'QB',
    spec: {
      position: 'QB',
      nameCol: 1,
      teamCol: 2,
      byeCol: 3,
      stats: [
        ['pAtt', 4],
        ['cmp', 5],
        ['payd', 6],
        ['patd', 7],
        ['int', 8],
        ['ruAt', 9],
        ['ruYd', 10],
        ['ruTd', 11],
      ],
      customCol: 13,
      refCol: 0,
    },
  },
  {
    sheet: 'RB',
    spec: {
      position: 'RB',
      nameCol: 1,
      teamCol: 2,
      byeCol: 3,
      stats: [
        ['ruAt', 4],
        ['ruYd', 5],
        ['ruTd', 6],
        ['tgt', 7],
        ['rec', 8],
        ['rcYd', 9],
        ['rcTd', 10],
      ],
      customCol: 14,
      refCol: 0,
    },
  },
  {
    sheet: 'WR',
    spec: {
      position: 'WR',
      nameCol: 1,
      teamCol: 2,
      byeCol: 3,
      stats: [
        ['ruYd', 4],
        ['ruTd', 5],
        ['tgt', 6],
        ['rec', 7],
        ['rcYd', 8],
        ['rcTd', 9],
      ],
      customCol: 13,
      refCol: 0,
    },
  },
  {
    sheet: 'TE',
    spec: {
      position: 'TE',
      nameCol: 1,
      teamCol: 2,
      byeCol: 3,
      stats: [
        ['tgt', 4],
        ['rec', 5],
        ['rcYd', 6],
        ['rcTd', 7],
      ],
      customCol: 11,
      refCol: 0,
    },
  },
];

/** DST stat projections live only on the visible `DST` sheet; `DST1` carries none (§3.1). */
function parseDstStats(rows: unknown[][]): Map<string, RawStats> {
  const map = new Map<string, RawStats>();
  // Header is row 0; data starts at row 1. Columns: 0 Ref, 1 TEAM, 2 ABBREV, 3 BYE,
  // 4 SACKS, 5 INT, 6 FORCED FUMBLE, 7 RECOV'D FUMBLE, 8 SAFETIES, 9 DEF TD.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const abbrev = cellToStr(row[2]);
    const code = normalizeTeam(abbrev);
    if (code === null) {
      continue;
    }
    map.set(code, {
      sacks: cellToNum(row[4]),
      defInt: cellToNum(row[5]),
      ff: cellToNum(row[6]),
      fr: cellToNum(row[7]),
      saf: cellToNum(row[8]),
      defTd: cellToNum(row[9]),
    });
  }
  return map;
}

/** Rankings blocks: header at row 1, sub-header row at 2 (0-indexed), data from row 3. */
const RANKINGS_BLOCKS: readonly { position: Position; nameCol: number; teamCol: number; idCol: number }[] = [
  { position: 'QB', nameCol: 2, teamCol: 3, idCol: 5 },
  { position: 'RB', nameCol: 7, teamCol: 8, idCol: 10 },
  { position: 'WR', nameCol: 12, teamCol: 13, idCol: 15 },
  { position: 'TE', nameCol: 17, teamCol: 18, idCol: 20 },
];

/** Opaque `Player ID` + name/team cross-check from the Rankings sheet (§3.1, §4). */
function parseRankings(rows: unknown[][]): Map<string, { playerId: number | null; team: string | null }> {
  const map = new Map<string, { playerId: number | null; team: string | null }>();
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] ?? [];
    for (const block of RANKINGS_BLOCKS) {
      const name = cellToStr(row[block.nameCol]);
      if (isSkippedName(name)) {
        continue;
      }
      const key = `${block.position}:${normalizeName(name)}`;
      if (map.has(key)) {
        continue;
      }
      const teamRaw = cellToStr(row[block.teamCol]);
      const idRaw = cellToNum(row[block.idCol]);
      map.set(key, {
        playerId: idRaw === 0 ? null : idRaw,
        team: normalizeTeam(teamRaw === '' ? 'WSH' : teamRaw),
      });
    }
  }
  return map;
}

/** Strip punctuation, suffixes and diacritics; case-fold (§4). */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/gu, '')
    .replace(/^(?<suffix>jr|sr|ii|iii|iv)$/u, '');
}

function parseMasters(
  wb: XLSX.WorkBook,
  rankings: Map<string, { playerId: number | null; team: string | null }>,
): PlayerRecord[] {
  const records: PlayerRecord[] = [];
  for (const { sheet, spec } of MASTER_SPECS) {
    for (const row of rowsOf(wb, sheet)) {
      const name = cellToStr(row[spec.nameCol]);
      if (isSkippedName(name)) {
        continue;
      }
      const teamRaw = cellToStr(row[spec.teamCol]);
      const team = normalizeTeam(teamRaw);
      if (team === null) {
        continue;
      }
      const rawStats: RawStats = {};
      for (const [key, col] of spec.stats) {
        rawStats[key] = cellToNum(row[col]);
      }
      const rankingsKey = `${spec.position}:${normalizeName(name)}`;
      const cross = rankings.get(rankingsKey);
      // The master-sheet team is authoritative; WAS/WSH is unified by normalizeTeam.
      const playerId = cross === undefined ? null : cross.playerId;
      records.push({
        id: `${spec.position}:${name}`,
        position: spec.position,
        name,
        team,
        bye: cellToNum(row[spec.byeCol]),
        rawStats,
        filePoints: cellToNum(row[spec.customCol]),
        playerId,
        ref: cellToNum(row[spec.refCol]),
      });
    }
  }
  return records;
}

function parseDsts(
  wb: XLSX.WorkBook,
  statsByCode: Map<string, RawStats>,
  rankings: Map<string, { playerId: number | null; team: string | null }>,
): PlayerRecord[] {
  const records: PlayerRecord[] = [];
  // DST1: 0 DSTRef, 1 Player (full name), 2 BYE, 3 Custom, 4 AUC$
  for (const row of rowsOf(wb, 'DST1')) {
    const name = cellToStr(row[1]);
    if (isSkippedName(name)) {
      continue;
    }
    const code = normalizeTeam(name);
    if (code === null) {
      continue;
    }
    const stats = statsByCode.get(code) ?? {};
    const playerId = rankings.get(`DST:${normalizeName(name)}`)?.playerId ?? null;
    records.push({
      id: `DST:${name}`,
      position: 'DST',
      name,
      team: code,
      bye: cellToNum(row[2]),
      rawStats: stats,
      filePoints: cellToNum(row[3]),
      playerId,
      ref: cellToNum(row[0]),
    });
  }
  return records;
}

/** Parse an uploaded workbook into the player table (§2.1). Throws on non-workbook input. */
export function parseWorkbook(bytes: ArrayBuffer | Uint8Array): PlayerRecord[] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  const sheetNames = wb.SheetNames;
  const known = sheetNames.filter(
    (n) => MASTER_SPECS.some((m) => m.sheet === n) || n === 'DST1' || n === 'DST' || n === 'Rankings',
  );
  if (known.length === 0) {
    throw new Error('This file does not look like an Athletic projections workbook (no expected sheets found).');
  }
  const rankings = parseRankings(rowsOf(wb, 'Rankings'));
  const records = parseMasters(wb, rankings);
  const dstStats = parseDstStats(rowsOf(wb, 'DST'));
  records.push(...parseDsts(wb, dstStats, rankings));
  return records;
}
