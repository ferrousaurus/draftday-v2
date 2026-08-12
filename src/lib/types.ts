/** Core domain types for Draft Day. */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'DST';

export type Platform = 'ESPN' | 'Yahoo' | 'Sleeper';

export type DraftType = 'REDRAFT' | 'BEST_BALL' | 'DYNASTY';

export type QbType = '1QB' | '2QB';

export type ScoringFormat = 'STANDARD' | 'HALF_PPR' | 'PPR';

/** Per-position raw stat categories read from the workbook master sheets (§3.1). */
export type RawStats = {
  pAtt?: number;
  cmp?: number;
  payd?: number;
  patd?: number;
  int?: number;
  ruAt?: number;
  ruYd?: number;
  ruTd?: number;
  tgt?: number;
  rec?: number;
  rcYd?: number;
  rcTd?: number;
  sacks?: number;
  defInt?: number;
  ff?: number;
  fr?: number;
  saf?: number;
  defTd?: number;
};

/** Parsed player record (§2.1). */
export type PlayerRecord = {
  id: string;
  position: Position;
  name: string;
  team: string;
  bye: number;
  rawStats: RawStats;
  filePoints: number;
  playerId: number | null;
  ref: number;
};

/** Scoring rates, one per app-model field (§3.2). */
export type ScoringSettings = {
  passAttempts: number;
  completions: number;
  targets: number;
  passYards: number;
  passTd: number;
  interceptions: number;
  rushYards: number;
  rushTd: number;
  recvYards: number;
  recvTd: number;
  receptionsRb: number;
  receptionsWr: number;
  receptionsTe: number;
  defSacks: number;
  defInt: number;
  defForceFumble: number;
  defRecoverFumble: number;
  defSafeties: number;
  defTd: number;
};

export type RosterSettings = {
  startingQb: number;
  startingRb: number;
  startingWr: number;
  startingTe: number;
  startingDst: number;
  flex: number;
  superflex: number;
  auctionBudget: number;
};

/** The full app settings object (§3.2). */
export type AppSettings = {
  platform: Platform;
  leagueAware: boolean;
  leagueId: string;
  espnS2: string;
  swid: string;
  draftType: DraftType;
  leagueSize: number;
  scoring: ScoringSettings;
  roster: RosterSettings;
  season: number;
};

export type AdpSource = 'league' | 'platform' | 'consensus';

/** One player's ADP entry as returned by a provider (§5.1). Position may be unknown to the provider. */
export type AdpRecord = {
  key: string;
  name: string;
  team: string;
  position: Position | null;
  adp: number | null;
  rank?: number;
  source: AdpSource;
};

/** ADP result attached to a workbook player (§2.2). */
export type PlayerAdp = {
  adp: number | null;
  rank?: number;
  source: AdpSource;
};

/** How ADP is obtained for the active configuration. */
export type AdpMode =
  | { kind: 'kona'; season: number; leagueId: string; qbType: QbType }
  | { kind: 'beatadp'; platform: Platform; draftType: DraftType; qbType: QbType; scoringFormat: ScoringFormat };

/** A player row on the draft board with all derived values (§2.2, §6). */
export type BoardPlayer = {
  player: PlayerRecord;
  projectedPoints: number;
  vorp: number;
  adp: number | null;
  adpSource: AdpSource | null;
  xadp: number | null;
  delta: number | null;
  steal: boolean;
  reach: boolean;
};

/** Per-position regression outcome (§6.2). */
export type RegressionResult = {
  position: Position;
  a: number;
  b: number;
  maxAdp: number;
  sample: number;
};

/** League settings locked from a provider (league-aware mode, §5.4). */
export type LeagueSettings = {
  leagueSize: number;
  scoring: ScoringSettings;
  roster: RosterSettings;
  draftType: DraftType;
};
