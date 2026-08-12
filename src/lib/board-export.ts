/**
 * CSV export of the visible draft board: mirrors the table's current rows,
 * sort (including nulls-last semantics matching BoardTable, §6.4) and drafted
 * state into a `draft-board.csv` download.
 */
import type { BoardPlayer } from './types.ts';

export type BoardExportSort = Readonly<{ id: string; desc: boolean }> | null;

/** Columns whose nulls always sort last, regardless of direction (§6.4). */
const NULLS_LAST_ACCESSORS: Record<string, (row: BoardPlayer) => number | null> = {
  adp: (r) => r.adp,
  xadp: (r) => r.xadp,
  delta: (r) => r.delta,
};

const NUMERIC_ACCESSORS: Record<string, (row: BoardPlayer) => number> = {
  projectedPoints: (r) => r.projectedPoints,
  vorp: (r) => r.vorp,
};

const STRING_ACCESSORS: Record<string, (row: BoardPlayer) => string> = {
  name: (r) => r.player.name,
  position: (r) => r.player.position,
  team: (r) => r.player.team,
};

const HEADERS = ['ADP', 'Name', 'Pos', 'Team', 'Proj Pts', 'VORP', 'xADP', 'Delta', 'Drafted'];

/** Serialize rows (sorted to match the visible table) as RFC 4180 CSV with a UTF-8 BOM for Excel. */
export function boardToCsv(
  rows: ReadonlyArray<BoardPlayer>,
  sort: BoardExportSort,
  drafted: ReadonlySet<string>,
): string {
  const sorted = sort === null ? [...rows] : [...rows].sort(compareRows(sort));
  const lines = [HEADERS, ...sorted.map((row) => csvRow(row, drafted))];
  return '\uFEFF' + lines.map((line) => line.map(csvEscape).join(',')).join('\r\n');
}

function compareRows(sort: Readonly<{ id: string; desc: boolean }>): (a: BoardPlayer, b: BoardPlayer) => number {
  const dir = sort.desc ? -1 : 1;
  return (a, b) => {
    const nullsLast = NULLS_LAST_ACCESSORS[sort.id];
    if (nullsLast !== undefined) {
      const va = nullsLast(a);
      const vb = nullsLast(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return compareNumbers(va, vb, dir);
    }
    const numeric = NUMERIC_ACCESSORS[sort.id];
    if (numeric !== undefined) return compareNumbers(numeric(a), numeric(b), dir);
    const str = STRING_ACCESSORS[sort.id];
    return str !== undefined ? str(a).localeCompare(str(b)) * dir : 0;
  };
}

function compareNumbers(a: number, b: number, dir: number): number {
  if (a === b) return 0;
  return (a < b ? -1 : 1) * dir;
}

function csvRow(row: BoardPlayer, drafted: ReadonlySet<string>): string[] {
  return [
    formatNullable(row.adp),
    row.player.name,
    row.player.position,
    row.player.team,
    row.projectedPoints.toFixed(1),
    row.vorp.toFixed(1),
    formatNullable(row.xadp),
    formatNullable(row.delta),
    drafted.has(row.player.id) ? 'Y' : 'N',
  ];
}

function formatNullable(value: number | null): string {
  return value === null ? '' : value.toFixed(1);
}

/** RFC 4180 quoting: quote only when needed, doubling embedded quotes. */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/** Trigger a client-side download of the CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Deferred revoke for Safari, which aborts the download on immediate revocation.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
