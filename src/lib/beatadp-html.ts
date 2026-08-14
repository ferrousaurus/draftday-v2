/**
 * BeatADP HTML table parser (§5.2). Parsing is isolated in this module and
 * fixture-tested. Markup shape verified live 2026-08-12:
 * a Next.js server-rendered `<table>` with columns
 * `# | Player | Consensus | Sleeper | ESPN | Yahoo | Underdog | FantasyPros`,
 * player cell = `<a>Name</a><span …>TEAM</span>`, missing value = `<span …>—</span>`.
 * An empty combination returns a page with no player rows.
 */
import type { AdpRecord } from './types.ts';
import { normalizeTeam } from './teams.ts';

export type ParsedBeatAdpRow = {
  name: string;
  team: string | null;
  consensus: number | null;
  sleeper: number | null;
  espn: number | null;
  yahoo: number | null;
  underdog: number | null;
  fantasyPros: number | null;
};

export type ParsedBeatAdpTable = { rows: ParsedBeatAdpRow[] };

const DASH = '—';

const VALUE_KEYS = ['consensus', 'sleeper', 'espn', 'yahoo', 'underdog', 'fantasyPros'] as const;
type ValueKey = (typeof VALUE_KEYS)[number];

function decodeEntities(text: string): string {
  return text
    .replaceAll(/&#x27;/giu, "'")
    .replaceAll(/&apos;/giu, "'")
    .replaceAll(/&amp;/giu, '&')
    .replaceAll(/&nbsp;/giu, ' ')
    .replaceAll(/&#39;/giu, "'");
}

function parseValue(text: string): number | null {
  const t = text.trim();
  if (t === '' || t === DASH) {
    return null;
  }
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function findRows(html: string): { cells: string[] }[] {
  const rows: { cells: string[] }[] = [];
  // Row starts with `<tr …>` followed by `<td`s; each data row carries exactly
  // the 8 table cells in order.
  const trRe = /<tr\b[^>]*>(?<trBody>[\s\S]*?)<\/tr\s*>/giu;
  let trMatch: RegExpExecArray | null = null;
  while ((trMatch = trRe.exec(html)) !== null) {
    const body = trMatch.groups?.trBody ?? '';
    if (!body.includes('<td')) {
      continue;
    }
    const cells: string[] = [];
    const tdRe = /<td\b[^>]*>(?<tdBody>[\s\S]*?)<\/td\s*>/giu;
    let tdMatch: RegExpExecArray | null = null;
    while ((tdMatch = tdRe.exec(body)) !== null) {
      cells.push(tdMatch.groups?.tdBody ?? '');
    }
    if (cells.length >= 8) {
      rows.push({ cells });
    }
  }
  return rows;
}

function stripTags(html: string): string {
  return html.replaceAll(/<[^>]*>/gu, '');
}

function parsePlayerCell(cell: string): { name: string; team: string | null } {
  const anchor = /<a\b[^>]*>(?<name>[\s\S]*?)<\/a\s*>/iu.exec(cell);
  const name = anchor === null ? stripTags(cell).trim() : stripTags(anchor.groups?.name ?? '');
  const teamSpan = /<span\b[^>]*>(?<name>[\s\S]*?)<\/span\s*>/iu.exec(cell);
  const rawTeam = teamSpan === null ? null : stripTags(teamSpan.groups?.name ?? '').trim();
  const team = rawTeam === null || rawTeam === '' ? null : normalizeTeam(rawTeam);
  return { name: decodeEntities(name).trim(), team };
}

/**
 * Parse the platform-adp HTML into the full table (all platform columns).
 * Returns null when the page contains no player rows (unsupported combination).
 */
export function parseBeatAdpHtml(html: string): ParsedBeatAdpTable | null {
  const rawRows = findRows(html);
  if (rawRows.length === 0) {
    return null;
  }
  const rows: ParsedBeatAdpRow[] = [];
  for (const { cells } of rawRows) {
    const player = parsePlayerCell(cells[1] ?? '');
    if (player.name === '') {
      continue;
    }
    const row: ParsedBeatAdpRow = {
      name: player.name,
      team: player.team,
      consensus: null,
      sleeper: null,
      espn: null,
      yahoo: null,
      underdog: null,
      fantasyPros: null,
    };
    for (let i = 0; i < VALUE_KEYS.length; i++) {
      const valueCell = cells[2 + i] ?? '';
      const key: ValueKey = VALUE_KEYS[i] ?? 'consensus';
      row[key] = parseValue(stripTags(valueCell));
    }
    rows.push(row);
  }
  return rows.length === 0 ? null : { rows };
}

/** Select the platform column with Consensus fallback (§5.2). */
export function platformValue(
  row: ParsedBeatAdpRow,
  platform: 'ESPN' | 'Yahoo' | 'Sleeper',
): { adp: number | null; source: 'platform' | 'consensus' } {
  let value: number | null = null;
  switch (platform) {
    case 'ESPN': {
      value = row.espn;
      break;
    }
    case 'Yahoo': {
      value = row.yahoo;
      break;
    }
    case 'Sleeper': {
      value = row.sleeper;
      break;
    }
  }
  if (value !== null) {
    return { adp: value, source: 'platform' };
  }
  return { adp: row.consensus, source: 'consensus' };
}

/**
 * Convert the parsed table into provider AdpRecords for the given platform.
 * BeatADP carries no position data (and no team defenses, §5.2); matching on
 * the board uses (name, team) with the workbook's position as a tiebreaker.
 */
export function toAdpRecords(table: ParsedBeatAdpTable, platform: 'ESPN' | 'Yahoo' | 'Sleeper'): AdpRecord[] {
  const records: AdpRecord[] = [];
  for (const row of table.rows) {
    const { adp, source } = platformValue(row, platform);
    records.push({
      key: row.name,
      name: row.name,
      team: row.team ?? '',
      position: null,
      adp,
      source,
    });
  }
  return records;
}
