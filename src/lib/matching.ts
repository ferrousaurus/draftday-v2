/**
 * Player matching (§4): workbook players ↔ provider players by normalized
 * name + team (+ position as tiebreaker). No fuzzy matching in v1.
 */
import { normalizeTeam, teamByProTeamId } from './teams.ts';
import type { AdpRecord, PlayerAdp, PlayerRecord } from './types.ts';

const SUFFIXES = /(?:^|\s)(?:jr\.?|sr\.?|ii|iii|iv|v)$/u;

/** Strip punctuation, suffixes (Jr./Sr./II/III), diacritics; case-fold (§4). */
export const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/gu, '')
    .toLowerCase()
    .replace(SUFFIXES, '')
    .replaceAll(/[^a-z0-9]/gu, '');

/**
 * Attach provider ADP records to workbook players. Match quality: exact
 * (name, team) preferred; (name, position) allowed when the team differs by
 * provider convention; unresolved players get `adp = null` (§4).
 */
export function matchAdp(players: readonly PlayerRecord[], records: readonly AdpRecord[]): Map<string, PlayerAdp> {
  const byNameTeam = new Map<string, AdpRecord[]>();
  for (const rec of records) {
    const key = `${normalizeName(rec.name)}|${normalizeTeam(rec.team) ?? ''}`;
    const list = byNameTeam.get(key);
    if (list === undefined) {
      byNameTeam.set(key, [rec]);
    } else {
      list.push(rec);
    }
  }

  const out = new Map<string, PlayerAdp>();
  for (const p of players) {
    const teamKey = normalizeTeam(p.team) ?? p.team;
    const nameKey = normalizeName(p.name);
    // DST: match provider defenses by team code across name conventions
    // (`Broncos D/ST`-style nicknames vs workbook full names, §4).
    if (p.position === 'DST') {
      const defense = records.find(
        (r) => (r.position === 'DST' || /d\/st$/iu.test(r.name)) && (normalizeTeam(r.team) ?? '') === teamKey,
      );
      if (defense !== undefined) {
        out.set(p.id, pick(p, [defense]));
        continue;
      }
    }
    const candidates = byNameTeam.get(`${nameKey}|${teamKey}`);
    if (candidates !== undefined && candidates.length > 0) {
      out.set(p.id, pick(p, candidates));
      continue;
    }
    // (name, position) fallback when the provider team differs by convention.
    const byName = byNameTeam.get(`${nameKey}|`);
    if (byName !== undefined && byName.length > 0) {
      out.set(p.id, pick(p, byName));
      continue;
    }
    // Unresolved players get an explicit `adp = null` entry (§2.2, §4).
    out.set(p.id, { adp: null, source: 'consensus' });
  }
  return out;
}

function pick(player: PlayerRecord, records: AdpRecord[]): PlayerAdp {
  const samePosition = records.find((r) => r.position === null || r.position === player.position);
  const rec = samePosition ?? records[0];
  if (rec === undefined) {
    return { adp: null, source: 'consensus' };
  }
  return { adp: rec.adp, rank: rec.rank, source: rec.source };
}

/** Resolve a provider-side team token or ESPN `proTeamId` to an internal code. */
export function teamOfCodeOrId(team: string | undefined, proTeamId?: number): string | null {
  if (team !== undefined && team !== '') {
    const code = normalizeTeam(team);
    if (code !== null) {
      return code;
    }
  }
  if (proTeamId !== undefined) {
    return teamByProTeamId(proTeamId);
  }
  return null;
}
