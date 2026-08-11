# Draft Day — Specification

A web application to help a user on Draft Day for their Fantasy Football league. The user uploads a rankings/projections workbook (The Athletic format), selects a draft platform (ESPN, Yahoo, or Sleeper), optionally connects their league, and gets an interactive draft board that cross-references the file's projections with live ADP from the selected platform (or the league itself when league-aware), surfacing players whose ADP lags or leads their projected value (steals and reaches).

This document is the authoritative, non-vague specification. The workbook format reference lives in `.agents/skills/reading-athletic-projections/SKILL.md` (the canonical description of `resources/2026-FFB-Projections-0805-1.xlsx`); this spec defines how the app consumes it.

---

## 1. User Flow

1. **Landing** (`/`): the user is prompted to drag-and-drop an `.xlsx` projections file (or resume an existing session; §7).
2. The file is **parsed client-side** and **persisted to IndexedDB** (§7). The workbook is a **projections source only** — its `Settings` sheet never pre-fills the league settings form (it is read only by the oracle test, §3.3).
3. The user selects a **platform** (`ESPN` | `Yahoo` | `Sleeper`) and optionally enables **league-aware** mode (§5). The league settings form is filled from the app's own defaults or the saved session — never from the workbook.
4. League-aware ESPN requires `leagueId` + `espn_s2`/`SWID` and **locks** the scoring/roster settings to the league's own settings (§5.4). League-aware Sleeper requires only `leagueId` (public API) and locks scoring likewise. Yahoo has no league-aware mode.
5. ADP is fetched through server functions (§5): league-aware ESPN uses the league-scoped kona endpoint; every other mode uses BeatADP (platform column, Consensus fallback).
6. The app computes VORP per player (§6) and navigates to the **draft board** (`/board`) — immediately, without waiting for ADP; xADP and deltas populate once ADP arrives, with skeleton/empty placeholders while it loads (§8.1).
7. The board is a sortable/filterable data table, default-sorted by ADP, with steals accented and reaches dimmed (§6.4, §8), plus minimal draft-day pick tracking (§8.1).

Settings changes recompute Projected Points, VORP, xADP, and deltas **live, client-side** — no server round-trip for recomputation; xADP and deltas also update when ADP (re)arrives. A `scoringFormat` change (via the PPR chip, a Custom-mode RECEPTIONS stepper, or a league-aware lock) additionally refetches ADP — it alters the BeatADP URL and the provider key, §8.2. Season is passed only to the kona fetch: in league-aware ESPN a season change refetches ADP, which transitively refits the regression and changes xADP and deltas; BeatADP is seasonless, so season never affects ADP there. Projected Points and VORP never depend on season or ADP, §5.3.

## 2. Data Model

### 2.1 Parsed player record

| Field        | Type                                  | Source                                                                                  |
| ------------ | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `id`         | string                                | `${position}:${playerName}` (stable per-file key)                                       |
| `position`   | `QB` \| `RB` \| `WR` \| `TE` \| `DST` | master sheet block                                                                      |
| `name`       | string                                | master sheet `Player` (team full name for DST)                                          |
| `team`       | string                                | master sheet `TM`; canonical internal code (see §4); `DST` uses team full name + abbrev |
| `bye`        | number                                | master sheet `BYE`                                                                      |
| `rawStats`   | object                                | per-position stat categories (§3.1)                                                     |
| `filePoints` | number                                | workbook's `Custom` value (reference only; oracle for tests)                            |
| `playerId`   | number \| null                        | `Rankings` sheet `Player ID` (opaque; **not** used for matching, §4)                    |
| `ref`        | number                                | master-sheet `*Ref` index (join key with `Rankings`)                                    |

### 2.2 Derived per-player values

- `projectedPoints` — recomputed from `rawStats` under the active scoring settings (§3).
- `vorp` — `projectedPoints − replacementBaseline(position)` (§6.1); can be negative.
- `adp` — from the ADP provider (§5); `null` when unavailable. Carries a `source` tag: `league` (kona), `platform` (BeatADP platform column), or `consensus` (BeatADP Consensus fallback).
- `xadp` — expected ADP from the position log-linear regression (§6.2); `null` without ADP.
- `delta` — `adp − xadp` in picks (§6.3).

## 3. Parsing & Scoring

### 3.1 Parsing scope (which sheets, what rules)

The **app parses exactly seven sheets** from the uploaded workbook:

1. **`QB`** (hidden master) — `QBRef, Player, TM, BYE, PATT, CMP, PAYD, PATD, INT, RUAT, RUYD, RUTD, FPS, Custom, AUC$`.
2. **`RB`** (hidden master) — `RBRef, Player, TM, BYE, RUAT, RUYD, RUTD, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`.
3. **`WR`** (hidden master) — `WRRef, Player, TM, BYE, RUYD, RUTD, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`.
4. **`TE`** (hidden master) — `TERef, Player, TM, BYE, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`.
5. **`DST1`** (hidden master) — `DSTRef, Player, BYE, Custom, AUC$` (`Player` = full team name, e.g. `Arizona Cardinals`).
6. **`DST`** (visible) — `Ref, TEAM, ABBREV, BYE, SACKS, INT, FORCED FUMBLE, RECOV'D FUMBLE, SAFETIES, DEF TD, …`. **The only source of DST stat projections** — `DST1` carries no stat columns. Merged into DST records by `ABBREV`/`TEAM` (safeties are empty in all rows; buckets are ignored, see §3.2).
7. **`Rankings`** (hidden) — the `Name / Team / Position / Player ID` blocks; used **only** for the opaque `Player ID` and as a name/team cross-check. Note: this sheet uses `WAS` for Washington (team sheets use `WSH`); normalize to a single internal code.

The **`Settings` sheet is not parsed by the app.** The test suite reads it directly to run the oracle (§3.3).

Parsing rules:

- Read cached cell values (never recompute workbook formulas; the workbook has a broken external link and cached values are authoritative).
- Skip rows whose `Player` is empty, `"0"`, or a placeholder; skip `#N/A` cached cells.
- Percentages are decimal fractions; BYE weeks are integers — we consume raw stat counts only, so no unit conversion is needed.
- No kickers exist in the file; the app handles exactly QB/RB/WR/TE/DST.
- `AUC$` is read for provenance only and is not retained on the player record (§2.1); auction dollars are unused in v1 (§3.2).

### 3.2 League settings (app-owned; never from the workbook)

| Group    | Field                                                                                      | Default                   | Editable                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform | Platform                                                                                   | ESPN                      | yes (`ESPN` \| `Yahoo` \| `Sleeper`)                                                                                                                                                                                                                                                       |
| Platform | League-aware                                                                               | off                       | yes (ESPN/Sleeper only; hidden for Yahoo)                                                                                                                                                                                                                                                  |
| Platform | League ID                                                                                  | —                         | yes (required when league-aware)                                                                                                                                                                                                                                                           |
| Platform | ESPN credentials (`espn_s2` / `SWID`)                                                      | —                         | yes (required when league-aware ESPN) — persisted with settings (§5.5, §7); never stored server-side or in any cache                                                                                                                                                                       |
| Platform | Draft type                                                                                 | REDRAFT                   | yes — options depend on platform: ESPN=`REDRAFT` only (the select is inert — ESPN never exposes best-ball or dynasty); Yahoo=`REDRAFT`, `BEST_BALL`; Sleeper=`REDRAFT`, `BEST_BALL`, `DYNASTY`. **Locked to the league's type when league-aware** (keeper leagues map to `REDRAFT`, §5.4). |
| Core     | PPR                                                                                        | 0.5 (RB/WR/TE)            | yes (0 / 0.5 / 1 / Custom) — a segmented control over the three RECEPTIONS fields; `Custom` reveals a per-position RECEPTIONS stepper for RB/WR/TE (§3.2 note)                                                                                                                             |
| Core     | League size (teams)                                                                        | 12                        | yes (drives §6.1 baselines and §6.3 round rule)                                                                                                                                                                                                                                            |
| Core     | Pass TD                                                                                    | 4                         | yes (segmented 4 / 6)                                                                                                                                                                                                                                                                      |
| Scoring  | PASS ATTEMPTS / COMPLETIONS / TARGETS                                                      | 0                         | yes (advanced, collapsible)                                                                                                                                                                                                                                                                |
| Scoring  | PASS YARDS                                                                                 | 0.04                      | yes (segmented 0.04 / 0.05 / 0.1)                                                                                                                                                                                                                                                          |
| Scoring  | INTERCEPTIONS                                                                              | −2                        | yes                                                                                                                                                                                                                                                                                        |
| Scoring  | RUSH YARDS / RECV YARDS                                                                    | 0.1                       | yes                                                                                                                                                                                                                                                                                        |
| Scoring  | RUSH TDS / RECV TDS                                                                        | 6                         | yes                                                                                                                                                                                                                                                                                        |
| Scoring  | RECEPTIONS (RB / WR / TE)                                                                  | 0.5 each                  | yes — **canonical** PPR representation; revealed as per-position steppers under the PPR chip's `Custom` option (§3.2 note)                                                                                                                                                                 |
| Scoring  | DEF SACKS / DEF INT / DEF FORCE FUMBLE / DEF RECOVER FUMBLE / DEF SAFETIES / DEF TOUCHDOWN | 1 / 2 / 1 / 1 / 2 / 6     | yes                                                                                                                                                                                                                                                                                        |
| Scoring  | DEF points-allowed buckets                                                                 | n/a                       | **hidden** — the workbook carries no per-team game distribution, so bucket scoring cannot be priced (verified: the file's own DST totals ignore buckets entirely)                                                                                                                          |
| Roster   | STARTING QB / RB / WR / TE / DST / FLEX / SUPERFLEX                                        | 1 / 2 / 3 / 1 / 1 / 1 / 0 | yes — active: `qbType` derivation (§3.2) and VORP replacement baselines (§6.1); sourced from the league when league-aware (§5.4)                                                                                                                                                           |
| Roster   | AUCTION BUDGET                                                                             | 200                       | yes — stored, unused in v1 (no auction dollars anywhere in v1)                                                                                                                                                                                                                             |
| Season   | Season                                                                                     | 2026                      | yes (advanced) — passed to the kona provider; BeatADP is seasonless ("latest")                                                                                                                                                                                                             |

**PPR chip rule:** the three per-position `RECEPTIONS` values are canonical. The PPR chip is a segmented control with options `0` / `0.5` / `1` / `Custom`. Selecting `0`, `0.5`, or `1` writes all three RECEPTIONS at once. Selecting `Custom` reveals a per-position RECEPTIONS stepper (RB/WR/TE, validated `0–2`); the chip reflects `Custom` whenever the three values diverge or take a non-`0`/`0.5`/`1` value. The chip's display value is computed during render from the canonical RECEPTIONS triple (no stored derived state).

**Input widgets & validation:** PPR, Pass TD, and Pass Yards are segmented controls (as above). Everything else is a free numeric stepper validated by Zod with sanity bounds (validation-only, never UI-blocking): league size integer 2–32, RECEPTIONS 0–2, rush/recv yards 0.01–0.2, TD rates 0–10, INT −5…0, DST rates 0–10. Negative rates are stored signed; the engine computes `Σ stat × rate` with no sign special-casing.

**`qbType` is derived, never stored:** `(STARTING QB + STARTING SUPERFLEX) ≥ 2 → "2QB"`, else `"1QB"` — from the league's lineup settings when league-aware, from the form's roster settings otherwise. **`scoringFormat` is derived, never stored:** PPR `0` → `STANDARD`, `0.5` → `HALF_PPR`, `1` → `PPR`, `Custom` → `PPR` (ADP assumes PPR for custom/divergent RECEPTIONS) — used only for the BeatADP URL. In league-aware ESPN, the league's single PPR value writes all three RECEPTIONS; a fractional league PPR (e.g. 0.75) puts the chip in `Custom` and `scoringFormat` is `PPR`, reflecting the league's non-zero PPR (§5.3).

### 3.3 Scoring engine

`projectedPoints = Σ (stat × points-per-unit)` using the active settings:

- **QB**: `PAYD×payds + PATD×patd + INT×intRate + RUYD×ruyd + RUTD×rutd` (all other categories price at 0 in the default table but remain formula-respectful).
- **RB/WR/TE**: the above rushing/receiving terms plus `REC × ppr(position)` and `RCYD×rcyd + RCTD×rctd`.
- **DST**: `SACKS×1 + INT×2 + FF×1 + FR×1 + SAF×2 + TD×6` (at default rates; editable). Points-allowed buckets are not applied in v1.

**Oracle test:** the test suite parses the workbook's `Settings` sheet (test-only), runs the engine under _those_ settings, and requires `projectedPoints` to reproduce the workbook's `Custom` values within `1e-6` relative error for all positions. The oracle runs against the real workbook when present and **skips cleanly when absent**; a committed synthetic fixture (a small hand-built xlsx under `tests/fixtures/`) exercises the parser and pins the engine math in CI. The app itself never reads `Settings`. The QB master `FPS` differs from `Custom` (~5.6 pts for Josh Allen); the oracle targets `Custom`; the discrepancy is documented in `tests/scoring.test.ts`. The league-aware ESPN tests (kona live-probe fixtures, §5.3) follow the same skip-cleanly rule for their credentials: they read `VITEST_ESPN_S2` / `VITEST_SWID` / `VITEST_ESPN_LEAGUE` from the environment (validated by Varlock, §10.2) and skip when absent.

## 4. Player Matching (file → ADP provider)

Match workbook players to provider players by **normalized name + team (+ position as tiebreaker)**:

- Normalize names: strip punctuation, suffixes (`Jr.`, `Sr.`, `II`, `III`), diacritics; case-fold.
- Team codes unified to a **single internal mapping** spanning all sources: workbook codes (mixed 2/3-letter: `NE`, `KC`, `ARI`, …), BeatADP 2-letter codes, ESPN `proTeamId` (classic numbering, §5.3), and `WSH`/`WAS` unification.
- DST: match by team abbrev ↔ full-name table, and against provider-side defense names (`Broncos D/ST`-style nicknames for ESPN; workbook full names like `Arizona Cardinals`). The app ships the 32-team nickname↔full-name table.
- Match quality: exact (name, team) preferred; (name, position) allowed when team differs by provider convention; unresolved players get `adp = null` (§2.2, §6.1). **No fuzzy matching in v1.**
- Unmatched players are visible: the board's "N players without ADP" note expands to the list of names/teams/positions (§6.4).

The workbook's 5-digit `Player ID` is **opaque** — verified against live ESPN and Sleeper APIs that it belongs to neither ID space. It is stored for provenance and never used for matching.

## 5. ADP Providers

### 5.1 Contract

One provider interface:

```
fetchAdp({ season?, platform, leagueAware, leagueId?, cookies?, draftType, qbType, scoringFormat })
  → Map<playerKey, { adp: number | null, rank?: number, source: "league" | "platform" | "consensus" }>
```

Two implementations: `KonaProvider` (league-aware ESPN) and `BeatAdpProvider` (all other modes). Each implementation consumes only the params it needs — `KonaProvider` reads `{season, leagueId, cookies, qbType}` (its PPR variant comes from the league response's own PPR, not from `scoringFormat`); `BeatAdpProvider` reads `{platform, draftType, qbType, scoringFormat}`. `platform` and `leagueAware` route the call to the right implementation; the rest are ignored by the implementation that doesn't use them. **All provider traffic flows through TanStack Start server functions** (Nitro `deno_deploy` preset build, running on Deno Deploy). The browser never calls ESPN or beatadp.com directly. One uniform code path; no CORS exposure.

### 5.2 BeatADP provider (Yahoo, Sleeper, and ESPN without league-aware)

- **Source:** `https://www.beatadp.com/platform-adp?scoringFormat={PPR|HALF_PPR|STANDARD}&draftType={REDRAFT|DYNASTY|BEST_BALL}&qbType={1QB|2QB}` — server-rendered HTML table, columns `# | Player (name+team) | Consensus | Sleeper | ESPN | Yahoo | Underdog | FantasyPros`. No JSON API exists; the server function **scrapes and parses the HTML table** (parsing isolated in one module, fixture-tested).
- **Value selection:** the column for the selected platform; `—` (missing) → **fall back to the `Consensus` column**, tagged `source: "consensus"` and surfaced with an indicator in the UI (§6.4). If Consensus is also missing → `adp = null`.
- **DST:** BeatADP carries no team defenses — all DST rows show blank ADP in BeatADP modes, with a position-level footnote ("Team defenses aren't tracked by BeatADP") rather than generic unmatched entries.
- **Empty state:** unsupported combinations (verified: 2QB is mostly empty — only `HALF_PPR/REDRAFT/2QB` has data) return a page with no rows → the board shows a banner ("BeatADP has no ADP data for 2QB/PPR — try 1QB or another scoring format"). Empty results are cached under the same key and the same midnight-UTC TTL as populated results (no special-casing).
- **Caching — Deno KV:** the parsed table (all platform columns) is cached per `(scoringFormat, draftType, qbType)` combo under the array key `["beatadp", scoringFormat, draftType, qbType]`, value `{ data: ParsedTable, fetchedAt: number }` (mirroring the client-side `adpCache` shape, §7), **expiring at midnight UTC each day** via Deno KV's `expireIn` (milliseconds until next UTC midnight, computed by the pure helper `msUntilNextUtcMidnight(now: Temporal.Instant = Temporal.Now.instant()): number`; Deno KV's expiry is non-strict — a key may persist briefly past midnight). The cache calls `Deno.openKv()` directly via a promise-latch memo (one-time cost on first cache access, no top-level `await`, §10). In dev and tests, `Deno.openKv()` returns an in-memory backing store with identical API surface — the same code path is exercised fully in CI; in prod, the handle auto-connects to the app's assigned Deno KV database with no in-repo config. Nothing credential-related is persisted server-side (§5.3, §5.5 — kona cookie-authenticated responses are never cached server-side; they are cached client-side in IndexedDB, §7); the BeatADP daily cache is the sole server-side persistence.
- The BeatADP page changes daily ("latest" data); there is no season parameter.

### 5.3 Kona provider (league-aware ESPN only)

**Validated live 2026-08-11:**

- **Endpoint:** `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{leagueId}?view=kona_player_info` — the `fantasy.espn.com` host redirects to a marketing page; `lm-api-reads` is the only usable host. **`view=kona_player_info` is required.**
- **Headers:** `X-Fantasy-Filter` — `{"players": {"filterStatus": {"value": ["FREEAGENT","WAIVERS"]}, "filterSlotIds": {"value": [0,2,4,6,16]}, "filterRanksForScoringPeriodIds": {"value": [1]}, "sortDraftRanks": {"sortPriority": 100, "sortAsc": true, "value": "<STANDARD|PPR|SUPERFLEX|ELIMINATION>"}, "limit": 1000}}` — plus `Cookie: swid=…; espn_s2=…`.
- **Fields:** `player.ownership.averageDraftPosition` = **ADP** (populated for every player in the pool, preseason included, down to ~pick 170); `player.draftRanksByRankType.<variant>.rank` = fallback signal (all four variants present; `published: false` is cosmetic preseason state and does not gate anything); `player.proTeamId` = classic ESPN numbering (verified: 1 ATL, 2 BUF, 4 CIN, 8 DET, 11 IND, 12 KC, 13 LV, 14 LAR, 22 ARI, 25 SF, 26 SEA, 34 HOU, …); `player.defaultPositionId` (1/2/3/4/16 = QB/RB/WR/TE/DST); `player.stats[].appliedTotal` = league-scored projections (not consumed — the workbook is the projection source).
- **Settings shape** (the league-settings authority, §5.4): the response's top-level `settings` object is `{ size: number; scoringSettings: Record<ruleId, number>; rosterSettings: Record<slotId, number>; isKeeper: boolean }` — `size` = league size (teams); `scoringSettings` maps ESPN scoring-rule ids to rates (PPR is a single value, written to all three RECEPTIONS fields); `rosterSettings` maps lineup-slot ids to starter counts (QB/RB/WR/TE/FLEX/SF/DST); `isKeeper` → draftType `REDRAFT` (§5.4). The rule/slot-id mapping to the app model is pinned by the live probe and the fixture tests (which run against the `VITEST_ESPN_*` credentials from the environment — validated by Varlock, §10.2 — and skip cleanly when absent, §3.3).
- **Variant selection:** `SUPERFLEX` when the league's `qbType` is `2QB` (§3.2), else `PPR` when league PPR ≠ 0 (fractional values included, e.g. 0.75), else `STANDARD` when league PPR = 0 — rank fallback only; ADP itself is variant-agnostic. The variant is ESPN's rank-type label, a separate naming space from `scoringFormat` (the BeatADP URL label, §3.2); kona never reads `scoringFormat` (§5.1). `ELIMINATION` stays a valid header value but is unused in v1.
- **Coverage:** full pool fetched with `limit: 1000` (QB 127, RB 235, WR 357, TE 192, DST 32) — every workbook player has a counterpart. `filterStatus` FREEAGENT/WAIVERS excludes keepers, matching the draft-eligible pool.
- **Authentication:** anonymous access is impossible — the league endpoint returns **401** without cookies, and the anonymous players endpoint serves only a fixed 50-player alphabetical stub with no draft data. **There is no public ESPN ADP path.** League-aware is therefore the only kona mode; when credentials are absent, the board degrades to BeatADP's ESPN column with a banner (§5.5).
- **Caching:** kona responses are **never cached server-side** — no Deno KV, no in-memory cache. Kona responses are league-scoped and cookie-authenticated, and the "nothing credential-related persisted server-side" boundary (§5.2, §5.5) is a hard rule for them: Deno KV is durable and replicated across data centers, and even a per-instance in-memory `Map` (Deno Deploy instances are isolated, evictable, and possibly running in multiple regions concurrently, so a per-instance cache is unreliable anyway) is dropped so no authenticated league data ever exists outside the client's browser. The only kona cache is the client-side IndexedDB `adpCache` (§7), keyed by provider parameters `(season, leagueId, qbType)` — never by credentials — with the same midnight-UTC expiry as every other provider.

### 5.4 League settings (league-aware lock)

When league-aware is enabled, the league API is the settings authority:

- **ESPN:** the kona response's `settings` object (§5.3) (scoring rates, lineup slots, league size, league type, PPR). Single PPR value → all three RECEPTIONS fields.
- **Sleeper:** `https://api.sleeper.app/v1/league/{leagueId}` (public, no auth) — `settings.scoring` and `settings.roster` mapped to the app model; league type (`redraft`/`dynasty`/`keeper`/`best_ball`) → draftType (**keeper maps to `REDRAFT`**, **`best_ball` maps to `BEST_BALL`**); lineup → qbType derivation.

**Lock scope (exactly):** Core (PPR, league size, pass TD), the full scoring table, the roster fields (STARTING QB/SUPERFLEX and the rest), and draftType are locked and sourced from the league. Season stays editable; advanced fields the league doesn't model (pass attempts/completions/targets) stay editable; AUCTION BUDGET stays editable (inert in v1). Un-toggling league-aware unlocks everything with values preserved. **League fetch failure** (bad leagueId, 401, league not found) → banner + form stays unlocked/editable, never blocked.

### 5.5 Failure, degradation, security

- Failures surface as a banner with a retry action; the board remains fully usable without ADP data (columns blank, §6.1).
- **No-credentials restore (ESPN league-aware):** credentials persist with settings, so a reopened tab restores league-aware mode. When credentials are absent (never entered, cleared, or removed by "Start over") or rejected (401), the board degrades to BeatADP's ESPN column with a banner — "League-aware credentials were cleared — showing BeatADP's ESPN ADP. Reconnect your league in settings" — and the ADP-source label shows the degradation. Consistent with a league-fetch failure (§5.4), the previously locked settings unlock and stay editable with their values preserved; re-entering valid credentials re-locks them from the league. Sleeper is unaffected (its `leagueId` is public and persists).
- **Credentials:** `espn_s2`/`SWID` are entered in the setup UI and **persisted with settings in IndexedDB** (§7) — never stored server-side, never logged, never written to any cache (Deno KV or in-memory, §5.3) — and passed as arguments to the kona server function per request (transmitted, never retained). The kona _response_ is never cached server-side (§5.3); it is cached client-side in the IndexedDB `adpCache` like every other provider's response (§7).
- `leagueId` (ESPN or Sleeper) is a public identifier and is persisted with settings.

## 6. VORP, xADP, Deltas, and the Round Rule

### 6.1 VORP

`vorp = projectedPoints − replacementBaseline(position)`, where the baseline is the projected points of the player at a **league-derived replacement rank** per position:

| Position | Replacement rank                    |
| -------- | ----------------------------------- |
| QB       | `TEAMS × (STARTING QB + SUPERFLEX)` |
| RB       | `TEAMS × (STARTING RB + FLEX/2)`    |
| WR       | `TEAMS × (STARTING WR + FLEX/2)`    |
| TE       | `TEAMS × STARTING TE`               |
| DST      | `TEAMS × STARTING DST`              |

Odd team counts round up to the next even number before ranks are computed (11 teams → 12, 9 teams → 10); ranks then clamp to `[1, position count]`. Baselines recompute live with settings (league size or roster changes propagate to VORP and xADP). Defaults (12 teams, 1/2/3/1 + 1 flex): QB12, RB30, WR42, TE12, DST12. VORP may be negative for below-replacement players. The workbook's own VORP column is **not** used (projections-only rule; its formulas are idiosyncratic).

### 6.2 Regression input & fit

Per position, the fit uses matched players **with ADP and positive VORP** (`vorp > 0`); players without ADP are excluded from the fit and displayed with blank ADP/xADP/delta.

**Why positive-VORP only (probe-validated 2026-08-11):** BeatADP consensus ADP × Athletic 0805 half-PPR projections (n=328) compared linear, log-linear, quadratic, cubic, exponential, and power fits. On the **full domain** the log form is the _worst_ of the smooth curves — quadratic/cubic fit best (R² ≈ 0.80 on VORP) and log-linear ranks last (R² ≈ 0.75), because 74% of the player pool projects below replacement and a log curve crosses zero far too early (ADP ≈ 50 vs ≈ 75 actual). Restricted to **positive-VORP players** (the top ~80–130, roughly ADP 1–100 — the region where draft value lives), **log-linear is the best fit** in the prediction direction `ln(adp) ~ vorp`: pooled R² = 0.864 (vs 0.60 linear, 0.78 quadratic), per-position QB 0.898 / RB 0.927 / WR 0.903 / TE 0.755. Below-replacement players add no signal — the clamp below maps them to the board tail anyway.

Per-position **log-linear** regression: `ln(adp) = a + b·vorp` via ordinary least squares, per position (QB/RB/WR/TE/DST independently); note `b < 0`. Then

`xadp = clamp(e^(a + b·vorp), 1, maxADP)`

(`maxADP` = the largest ADP observed for that position; below-replacement players clamp to `maxADP`, i.e. the end of the board). Delta remains in absolute picks because the output is transformed back.

**Minimum sample:** a position fit requires **at least 5 players with positive VORP and ADP**; below that, `xADP = null` for the entire position with a board footer note ("{position} xADP unavailable: fewer than 5 positive-VORP players with ADP"). Degenerate fits (zero variance in VORP or ln(ADP)) also yield null + note, never a garbage line. **DST in BeatADP modes:** DST has no ADP samples at all (§5.2 — BeatADP carries no team defenses), so no fit can run; DST rows render per §6.4 — blank ADP/xADP/delta, sorted to the bottom, with the position-level DST footnote. In league-aware ESPN, DST has ADP and the fit runs normally.

### 6.3 Deltas & round rule

- `delta = adp − xadp` (picks; positive = market drafts the player later than his projections imply).
- **Steal**: `delta ≥ teams` (at least one full round later than expected) → accented.
- **Reach**: `delta ≤ −teams` → dimmed.
- Everything else renders normally. Accenting is binary; no gradient in v1.

### 6.4 Display

Board columns: **ADP, Name, Position, Team, Projected Points, VORP, xADP, Delta**. Default sort: ADP ascending, nulls last. Players without ADP show blanks and sort to the bottom regardless of direction. While ADP is being fetched, the ADP and xADP columns show a skeleton (§8.1); VORP and Projected Points render immediately.

- **ADP-source labeling:** the board header line shows the active source ("ADP: ESPN league · fetched 14:32", "ADP: BeatADP Yahoo · fetched 14:32", …). Consensus-fallback cells carry an indicator (superscript † with tooltip + column-header legend: "† Consensus ADP — not available for [platform]").
- **"N players without ADP"** note; expands to the list of names/teams/positions (unmatched players, BeatADP-uncovered DSTs, etc.). A DST footnote explains BeatADP modes lack defenses entirely (§5.2).
- **Steals/reaches summary:** counts of steals and reaches reflecting the current filters.
- **Draft tracking (§8.1):** marked-drafted rows render struck-through/dimmed; a per-position counter strip shows drafted vs. starter slots.

## 7. Persistence & Restore

**IndexedDB is the canonical store** (via `idb-keyval`), keyed:

- `file` — the raw uploaded `.xlsx` (provenance + re-parse)
- `players` — the parsed player table
- `settings` — the full settings object (§3.2), including platform, league-aware, leagueId, `espn_s2`/`SWID`, draftType, season; never stored server-side or in any cache
- `adpCache` — `(provider key)` → `{ data, fetchedAt }`, **expiring at midnight UTC** (the BeatADP server Deno KV cache is midnight-UTC, §5.2; kona has no server-side cache at all, §5.3 — the client cache is midnight-UTC for both providers, computed by the same `msUntilNextUtcMidnight` helper)
- `drafted` — the set of marked-drafted player ids (§8.1)

**Zustand** holds the working state and persists via its `persist` middleware with a **custom IndexedDB adapter** (implements `getItem`/`setItem`/`removeItem` over idb-keyval). No localStorage anywhere. `espn_s2`/`SWID` are persisted with settings in the IndexedDB slice (§5.5).

**Restore flow:** on load, if `file` + `players` + `settings` exist → navigate straight to `/board` with everything restored; the board offers "Change file / settings" (→ `/`) and "Start over" (clears IndexedDB). Otherwise land on `/` with the dropzone. Uploading a new file replaces `file`/`players`, **keeps settings** (the workbook never pre-fills or overrides settings), recomputes everything, and re-fetches ADP.

**Cookies:** `espn_s2`/`SWID` persist with settings in IndexedDB, surviving reload and tab close (§5.5); they are never stored server-side or in any cache. Reopening with ESPN league-aware restores league-aware mode; the board degrades to BeatADP only when credentials are absent or rejected (§5.5).

## 8. UI & State

### 8.1 Routes (Tanstack Router, SPA mode)

- `/` — setup: dropzone, **platform selector** (ESPN/Yahoo/Sleeper), **league-aware toggle** (ESPN/Sleeper only — hidden for Yahoo), conditional fields (ESPN league-aware: `leagueId` + `espn_s2` + `SWID`; Sleeper league-aware: `leagueId` only), **draftType select** (options per platform; locked to league type when league-aware, §5.4), settings panel (§3.2, locked where league-aware), season. `qbType` and `scoringFormat` are derived and shown read-only. Successful setup auto-navigates to `/board` **immediately** — ADP loads on the board: the ADP column shows a skeleton while fetching; xADP shows a skeleton while ADP is being fetched (VORP never waits on ADP, §6.1); VORP and Projected Points render immediately; Delta renders once ADP and xADP are both present (§5.5 for failures).
- `/board` — the draft board: data table (Tanstack Table + Mantine), position filter chips, search box, sortable headers, "Refresh ADP" button, steals/reaches summary, ADP-source label (§6.4), draft tracking (click a row to mark drafted, click again to undo; per-position counters; state persisted under `drafted`).

### 8.2 State split

- **Search params** (the acceptance criterion): `q` (text), `pos` (comma-joined positions), `sort` (column key), `dir` (`asc`/`desc`), `steals` (`all` | `steals` | `reaches` | `none`). Board deep-links restore state; back/forward works. Draft-tracking state is _not_ in search params.
- **Zustand** (persisted to IndexedDB via the custom adapter): loaded file, parsed players, settings, drafted set; league-connect fields (`leagueId`, `espn_s2`/`SWID`) are part of the persisted settings slice; which ADP mode is active.
- **TanStack Query**: ADP fetches (server functions) with the IndexedDB `adpCache` behind them; invalidated by "Refresh ADP" and by settings changes that alter the provider key.

## 9. Design Notes & Known Limitations

1. **ESPN ADP endpoint.** The league-scoped kona pattern (§5.3) is validated end-to-end: `view=kona_player_info` + `X-Fantasy-Filter` + cookies returns the full player pool (fetched with `limit: 1000`) with `ownership.averageDraftPosition` for every player in it. The rank-per-variant fallback is used for the rare null-ADP case. `fantasy.espn.com` redirects to a marketing page, so the provider uses `lm-api-reads`. The anonymous endpoints are unusable (401 / fixed 50-player stub); there is no public mode. The `proTeamId` space is classic ESPN numbering (§5.3).
2. **QB `FPS` vs `Custom` discrepancy.** The engine reproduces `Custom` exactly at workbook-default settings for all players; master `FPS` is a separate 0-PPR formula (it appears computed from rounded inputs). The discrepancy (~5.6 pts for Josh Allen) is documented in `tests/scoring.test.ts`; the oracle targets `Custom`.
3. **Workbook `Player ID` space.** Identified as not-ESPN, not-Sleeper; left opaque. ID-based matching against an ADP source is not implemented in v1.
4. **BeatADP HTML-scraping fragility (accepted risk).** BeatADP has no JSON API; markup changes could break the parser. Mitigation: parsing is isolated in one module, fixture-tested, and the Deno KV cache limits fetch frequency. The table shape is re-verified on each BeatADP cache miss.
5. **BeatADP 2QB coverage (known limitation).** Only `HALF_PPR/REDRAFT/2QB` returns data; `PPR/2QB` and `STANDARD/2QB` are empty. Surfaced as a banner (§5.2).
6. **Deployment mechanism (post-v1).** The Deno Deploy deploy mechanism (`deno deploy` CLI vs GitHub auto-build; KV database assignment in the Deno Deploy dashboard) is post-v1. In dev the BeatADP cache runs against Deno's in-memory `Deno.openKv()` backing (no dashboard setup needed), so the same code path runs in CI. No in-repo deploy config exists in v1 — there is no Deno-side equivalent of `wrangler.toml`; the only out-of-band configuration is the KV database assignment in the Deno Deploy dashboard.

## 10. Deployment & Stack

- **Runtime/toolchain**: **Deno CLI** — Deno KV is reachable only from the Deno runtime (the `@deno/kv` Node client targets only Deploy Classic, sunset 2026-07-20). TanStack Start in SPA mode over a Nitro `deno_deploy` preset build; **deployed to Deno Deploy** (mechanism post-v1, §9.6). Dev: `deno task dev` (invokes Vite via Deno's npm-compat layer, preserving Vite HMR; the Varlock Vite plugin loads and validates the env at startup, §10.2). Test: `deno task test` (runs `deno run gen:types && vitest run`; the `VITEST_ESPN_*` vars are resolved, validated, and injected into the test process at vitest config resolution by the Varlock Vite plugin in `vitest.config.ts`, §10.2 — with `Deno.openKv()` returning an in-memory backing store). Deno's in-memory KV backing serves the KV role in dev and tests.
- **Lint/format**: `oxlint` + `oxfmt` (Rust-based), configured via `oxlint.config.ts` and `oxfmt.config.ts` respectively. `oxlint` runs **`eslint-plugin-react-you-might-not-need-an-effect`** via its ESLint-compatible JS-plugin layer (`oxlint.config.ts` → `jsPlugins`), enforcing the React docs' [You Might Not Need An Effect](https://react.dev/learn/you-might-not-need-an-effect) guidance: `no-derived-state`, `no-chain-state-updates`, `no-event-handler`, `no-adjust-state-on-prop-change`, `no-reset-all-state-on-prop-change`, `no-pass-live-state-to-parent`, `no-pass-data-to-parent`, `no-initialize-state`, `no-empty-effect`, plus the rest of the plugin's rule set. Rules are listed explicitly in `oxlint.config.ts` — oxlint does not apply ESLint `recommended` configs. **Type-aware linting is enabled** (`oxlint.config.ts` → `options.typeAware: true`, via the `oxlint-tsgolint` backend; stable since tsgolint v7, requires TypeScript 7+ and a root `tsconfig.json`, which oxlint discovers per file), adding the semantic `typescript/*` rules (`no-floating-promises`, `no-misused-promises`, …).
- **Typecheck**: `deno task check` runs `tsc --noEmit` — full-program type checking via TypeScript 7+ against `tsconfig.json`. (Vite/esbuild transpile; Deno strips types when running and does not type-check.) This is the typecheck gate; oxlint's experimental `--type-check` diagnostics mode is not used — oxlint's type-aware mode is lint-only. **Deno ambient types** are synced via `deno types > deno.d.ts` chained before each invocation: `"check": "deno types > deno.d.ts && tsc --noEmit"` (Deno does not support npm `pre`/`post` lifecycle hooks, so chaining is via `&&`). The file `deno.d.ts` is gitignored and regenerated before `lint`/`check`/`build`; `tsconfig.json` references it in `compilerOptions.types` so both `tsc --noEmit` and oxlint-tsgolint see `Deno`, `Deno.Kv`, `Temporal`, and the `Deno.openKv()` return type for `no-floating-promises` / `no-misused-promises` enforcement.
- **Stack**: React 19, TanStack Start (SPA) + Router, TanStack Query, TanStack Table, Zustand (with a custom IndexedDB persister), Vite 8, Nitro (`deno_deploy`), Mantine, Zod, `@e965/xlsx`, `idb-keyval`. Package management via `package.json` (Deno's first-class `package.json` support; `deno install` replaces pnpm, `deno task <name>` reads `scripts` from `package.json`). Dev tooling: `oxlint` + `eslint-plugin-react-you-might-not-need-an-effect` + `oxlint-tsgolint` (type-aware backend, requires TypeScript 7+ and root `tsconfig.json`), `oxfmt`, `vitest`, `tsc --noEmit`, `varlock` + `@varlock/vite-integration` (env validation, §10.2). Lockfile: `deno.lock` (committed). Dependencies via `package.json`, installed with `deno install`.

### 10.1 Deviations from `ferrousaurus-stack-preferences`

This app's runtime/deploy target breaches three rules in the project's `ferrousaurus-stack-preferences` skill:

1. **Deployment/Hosting** — Go-To: self-hosted Coolify; Deno Deploy is not listed but falls under the same "managed PaaS with vendor lock-in" rationale as the listed unacceptable options (Vercel, Cloudflare, AWS, …). **Breach rationale:** Deno KV is reachable only from the Deno runtime on Deno Deploy; the `@deno/kv` Node client targeted Deploy Classic, sunset 2026-07-20, and external KV Connect access to new-Deploy KV is not exposed. The breach is scoped to this app's deploy target, not a general endorsement.
2. **JavaScript Runtime** — Go-To: Node.js; Deno is Acceptable only "when running TypeScript scripts is simpler than bundling the application" (CLI tools, scripts). This app runs Deno as the whole-app runtime (dev + prod), exceeding that scope. **Breach rationale:** same as above; KV reachability requires the Deno runtime; dev/prod symmetry (one runtime, one API, one `openKv()` shape) is worth more than runtime conformity.
3. **Package Manager** — Go-To: pnpm; Deno is Acceptable only for TS-script execution. This app uses Deno's first-class `package.json` support as the package manager (`deno install`), exceeding that scope. **Breach rationale:** dev/prod symmetry; one CLI drives install + run + task dispatch; pnpm's symlink layout is not load-bearing for this app's toolchain.

The skill rule files are left unchanged — the breaches are app-specific, not project-wide.

### 10.2 Environment-variable validation (Varlock)

The app has **no env-driven runtime behavior**: the kona credentials (`espn_s2`/`SWID`) are user-entered client-side data (§5.5), not environment variables, and no server code consumes env vars. The project's only environment variables are the **test-suite credentials** for the league-aware ESPN live-probe tests (§5.3), read from the environment by test code:

| Var                  | Type   | Purpose                                                | Decorators                  |
| -------------------- | ------ | ------------------------------------------------------ | --------------------------- |
| `VITEST_ESPN_S2`     | string | `espn_s2` session cookie for the kona live-probe tests | `@type=string` `@sensitive` |
| `VITEST_SWID`        | string | `SWID` cookie for the kona live-probe tests            | `@type=string` `@sensitive` |
| `VITEST_ESPN_LEAGUE` | number | league id for the kona live-probe tests (public, §5.5) | `@type=number`              |

Validation, injection, and secret hygiene are handled by **Varlock** (varlock.dev) — the project's stack-preferred secrets-management tool per `ferrousaurus-stack-preferences`, so no deviation is recorded:

- **`.env.schema` (committed) is the single source of truth**: one item per variable with its decorators (`@type`, `@sensitive`) and **no values**. The schema is AI-safe by design — agents and tooling get full context on the config without ever seeing secret values. Root decorators: `@defaultSensitive=false` (sensitivity is per-item, never implied by key prefix; `VITEST_ESPN_LEAGUE` is a public identifier, the two cookies are explicitly `@sensitive`) and `@defaultRequired=infer` (an item with an empty schema value is optional), so a fresh clone without `.env.local` loads cleanly and the credential-dependent tests skip, mirroring the oracle-test rule (§3.3). **The schema must never contain values** — it is committed by design, and a schema with values is a config error, not a fallback.
- **`.env.local` (gitignored) holds the real values.** Varlock can store them device-locally encrypted (hardware-backed; the `varlock(local:…)` form), but either way they never enter the schema, any committed file, or any log. No environment-specific `.env.*` files and no `@currentEnv` flag exist — the app runs in a single environment and dev/test share `.env.local`.
- **Wiring:** `@varlock/vite-integration`'s `varlockVitePlugin` is registered in **both** `vite.config.ts` (dev/build) and `vitest.config.ts` (test suite). Importing the plugin runs `varlock load --format json-full --compact` at config-load time: the env is resolved and validated against `.env.schema`, the resolved values are injected into `process.env`, and console redaction for `@sensitive` values is enabled. Dev/build: misconfiguration fails fast with a clear message before any app code runs (no silent `undefined`). Test suite: the injection happens during vitest's config resolution in the main process and is inherited by the test worker processes, so test code reads the vars as plain `process.env` values — **no `varlock run` wrapper around the vitest command is needed** (a wrapped run would reuse the already-injected env via varlock's reuse path). The app never imports `varlock/auto-load` or the typed `ENV` object — there is no runtime env surface to type or to leak into client bundles (the `VITEST_` names carry no `VITE_` prefix, so Vite's client-side `import.meta.env` never exposes them regardless).
- **Security boundary:** the cookie vars are `@sensitive` — always redacted in CLI output, never logged, never written to any server-side store or cache (the §5.5 rule, applied to the test harness). Runtime credentials for the app itself are IndexedDB-only (§7) and never pass through env files at all.
- **CI:** the three vars are supplied as CI secrets; the league-aware tests skip when absent, and `varlock scan` runs in CI to catch leaked secrets before they reach the repo.

## 11. Acceptance Criteria

1. Drag-and-drop `.xlsx` upload parses the workbook (7 sheets, §3.1) and persists the raw file to IndexedDB.
2. Platform selection and league-aware flow work: ESPN/Yahoo/Sleeper selectable; league-aware available for ESPN and Sleeper; ESPN league-aware requires `leagueId` + `espn_s2` + `SWID`, Sleeper requires `leagueId`; Yahoo has no league-aware; draftType options match the platform; league-aware locks settings per §5.4.
3. League settings recompute live, client-side, without a server round-trip: league size and scoring-table changes recompute Projected Points, VORP, xADP, and deltas directly; a `scoringFormat` change (PPR chip, Custom-mode RECEPTIONS stepper, or league-aware lock) recomputes Projected Points and VORP and additionally refetches ADP (§8.2 — xADP and deltas update when the refetched ADP arrives). A season change in league-aware ESPN refetches kona ADP, which refits the regression and updates xADP and deltas; Projected Points and VORP never depend on season or ADP (§5.3 — BeatADP is seasonless).
4. With the workbook's own settings (read by the test), recomputed Projected Points reproduce the workbook's `Custom` values (oracle test) for all positions; the oracle skips cleanly without the real workbook.
5. ADP is fetched through server functions: kona for league-aware ESPN (cookie-authenticated; **never cached server-side** — cached client-side in the IndexedDB `adpCache`, §7) and BeatADP for every other mode (server-side scraped, **Deno KV-cached** with midnight-UTC expiry via the `expireIn` option in milliseconds; in dev the same code path runs against Deno's in-memory KV backing); failures surface with a retry and the board stays usable.
6. Consensus fallback works: a player missing platform ADP shows Consensus ADP tagged with the indicator; a player missing both shows blanks.
7. The board shows ADP, Name, Position, Team, Projected Points, VORP, xADP, and Delta; default-sorted by ADP with nulls last; ADP-source label present; DST rows blank-with-footnote in BeatADP modes.
8. Steals (`delta ≥ teams`) are accented and reaches (`delta ≤ −teams`) are dimmed; xADP comes from the VORP log-linear regression (§6.2) with the ≥5 positive-VORP sample rule.
9. Filter/search/sort state (`q`, `pos`, `sort`, `dir`, `steals`) is managed with search params; board deep-links restore that state.
10. Draft tracking works: mark/undo drafted, counters update, state survives reload from IndexedDB.
11. Reloading restores the session from IndexedDB without re-uploading; "Start over" clears it; ESPN league-aware credentials persist with settings (surviving tab close and reload), so reopening restores league-aware mode — degradation to BeatADP with a banner occurs only when credentials are absent or rejected.
12. `espn_s2`/`SWID` are persisted only in the client's IndexedDB settings slice — never stored server-side, never logged, and never written to any cache (Deno KV or in-memory, §5.3, §5.5).
13. `deno task dev`, `deno task lint` (chains `deno types > deno.d.ts &&` before `oxlint` with `eslint-plugin-react-you-might-not-need-an-effect` and type-aware linting enabled), `deno task fmt` (runs `oxfmt`), `deno task check` (chains `deno types > deno.d.ts &&` before `tsc --noEmit`), and `deno task test` (runs `deno run gen:types && vitest run`, with the `VITEST_ESPN_*` vars resolved, validated, and injected by the Varlock Vite plugin in `vitest.config.ts`) all pass. CI runs `deno task -A <name>` where Deno permission prompts would otherwise block non-interactively.
14. Environment variables are validated by Varlock (§10.2): `.env.schema` is committed and contains keys + decorators only (never values); `.env.local` is gitignored; dev/build validate through the Vite integration and the test suite through the same Varlock Vite plugin in `vitest.config.ts`, with misconfiguration failing fast and with a clear message; the league-aware ESPN tests read `VITEST_ESPN_S2` / `VITEST_SWID` / `VITEST_ESPN_LEAGUE` from the environment and skip cleanly when absent; `varlock scan` runs in CI and finds no leaked secrets.
