/**
 * ADP routing (§5.1, §8.2): derive the active provider mode from settings and
 * compute the client-side adpCache key. Pure, unit-tested.
 */
import type { AdpMode, AppSettings, DraftType, QbType, ScoringFormat } from './types.ts';
import { deriveQbType, deriveScoringFormat, DRAFT_TYPES_BY_PLATFORM } from './settings.ts';

/** The active ADP mode: kona for league-aware ESPN, BeatADP for everything else (§5.1). */
export function adpModeFor(settings: AppSettings): AdpMode {
  const qbType = deriveQbType(settings.roster);
  if (settings.platform === 'ESPN' && settings.leagueAware) {
    return { kind: 'kona', season: settings.season, leagueId: settings.leagueId, qbType };
  }
  return {
    kind: 'beatadp',
    platform: settings.platform,
    draftType: settings.draftType,
    qbType,
    scoringFormat: deriveScoringFormat({
      rb: settings.scoring.receptionsRb,
      wr: settings.scoring.receptionsWr,
      te: settings.scoring.receptionsTe,
    }),
  };
}

/** Cache key for the client-side adpCache (§5.3/§7: never keyed by credentials). */
export function adpCacheKey(mode: AdpMode): string {
  if (mode.kind === 'kona') {
    return `kona:${mode.season}:${mode.leagueId}:${mode.qbType}`;
  }
  return `beatadp:${mode.scoringFormat}:${mode.draftType}:${mode.qbType}`;
}

/** A human label for the board header ("ADP: ESPN league · fetched 14:32"). */
export function adpModeLabel(mode: AdpMode): string {
  if (mode.kind === 'kona') return 'ESPN league';
  let platform: string;
  switch (mode.platform) {
    case 'Yahoo':
      platform = 'Yahoo';
      break;
    case 'Sleeper':
      platform = 'Sleeper';
      break;
    default:
      platform = 'ESPN';
      break;
  }
  return `BeatADP ${platform}`;
}

export function platformHasLeagueAware(platform: AppSettings['platform']): boolean {
  return platform === 'ESPN' || platform === 'Sleeper';
}

export function draftTypeOptions(platform: AppSettings['platform']): readonly DraftType[] {
  return DRAFT_TYPES_BY_PLATFORM[platform];
}

export function scoringFormatLabel(format: ScoringFormat): string {
  switch (format) {
    case 'STANDARD':
      return 'Standard';
    case 'HALF_PPR':
      return '0.5 PPR';
    case 'PPR':
      return '1 PPR';
  }
}

export type { QbType };
