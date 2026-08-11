# Draft Day — Specification

A web application to help a user on Draft Day for their Fantasy Football league. The user uploads a rankings/projections workbook (The Athletic format), configures league scoring, and gets an interactive draft board that cross-references the file's projections with live average draft position (ADP) from ESPN, surfacing players whose ADP lags or leads their projected points (steals and reaches).

This document is the authoritative, non-vague specification. The workbook format reference lives in `.agents/skills/reading-athletic-projectsions/SKILL.md` (the canonical description of `resources/2026-FFB-Projections-0805-1.xlsx`); this spec defines how the app consumes it.

---

## 1. User Flow

1. **Landing** (`/`): the user is prompted to drag-and-drop an `.xlsx` projections file (or resume an existing session; §7).
2. The file is **parsed client-side** and **persisted to IndexedDB** (§7). The workbook's `Settings` sheet pre-fills the league settings form (§3.2).
3. The user confirms league settings: PPR, league size, pass-TD value, and (collapsible) the full scoring table, roster block, and season.
4. ADP is fetched for every matched player — public ESPN data by default; if the user opts to connect their ESPN league (`leagueId` + `espn_s2`/`SWID`), league-adjusted ADP instead (§5.2).
5. The app computes xADP per player (§6) and navigates to the **draft board** (`/board`).
6. The board is a sortable/filterable data table, default-sorted by ADP, with steals accented and reaches dimmed (§6.4, §8).

Settings changes recompute Projected Points, xADP, and deltas **live, client-side** — no server round-trip for recomputation.

## 2. Data Model

### 2.1 Parsed player record

| Field | Type | Source |
|---|---|---|
| `id` | string | `${position}:${playerName}` (stable per-file key) |
| `position` | `QB` \| `RB` \| `WR` \| `TE` \| `DST` | master sheet block |
| `name` | string | master sheet `Player` (team full name for DST) |
| `team` | string | master sheet `TM` (3-letter code); `DST` uses team full name + abbrev |
| `bye` | number | master sheet `BYE` |
| `rawStats` | object | per-position stat categories (§3.1) |
| `filePoints` | number | workbook's `Custom` value (reference only; oracle for tests) |
| `playerId` | number \| null | `Rankings` sheet `Player ID` (opaque; **not** used for matching, §4) |
| `ref` | number | master-sheet `*Ref` index (join key with `Rankings`) |

### 2.2 Derived per-player values

- `projectedPoints` — recomputed from `rawStats` under the active scoring settings (§3).
- `adp` — from the ADP provider (§5); `null` when unmatched/unavailable.
- `xadp` — expected ADP from the position regression (§6.2); `null` without ADP.
- `delta` — `adp − xadp` in picks (§6.3).

## 3. Parsing & Scoring

### 3.1 Parsing scope (which sheets, what rules)

Parse exactly six sheets from the uploaded workbook:

1. **`Settings`** — `A1:B28` scoring table + `D1:E10` roster table → default league settings (§3.2).
2. **`QB`** (hidden master) — `QBRef, Player, TM, BYE, PATT, CMP, PAYD, PATD, INT, RUAT, RUYD, RUTD, FPS, Custom, AUC$`.
3. **`RB`** (hidden master) — `RBRef, Player, TM, BYE, RUAT, RUYD, RUTD, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`.
4. **`WR`** (hidden master) — `WRRef, Player, TM, BYE, RUYD, RUTD, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`.
5. **`TE`** (hidden master) — `TERef, Player, TM, BYE, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`.
6. **`DST1`** (hidden master) — `DSTRef, Player, BYE, Custom, AUC$` (`Player` = full team name, e.g. `Arizona Cardinals`).
7. **`Rankings`** (hidden) — the `Name / Team / Position / Player ID` blocks; used **only** for the opaque `Player ID` and as a name/team cross-check. Note: this sheet uses `WAS` for Washington (team sheets use `WSH`); normalize to a single internal code.

Parsing rules:
- Read cached cell values (never recompute workbook formulas; the workbook has a broken external link and cached values are authoritative).
- Skip rows whose `Player` is empty, `"0"`, or a placeholder; skip `#N/A` cached cells.
- Percentages are decimal fractions; BYE weeks are integers — we consume raw stat counts only, so no unit conversion is needed.
- No kickers exist in the file; the app handles exactly QB/RB/WR/TE/DST.

### 3.2 League settings (defaults from the workbook `Settings` sheet)

| Group | Field | Default | Editable |
|---|---|---|---|
| Core | PPR | 0.5 (RB/WR/TE) | yes (0 / 0.5 / 1) |
| Core | League size (teams) | 12 | yes (drives §6.3 round rule) |
| Core | Pass TD | 4 | yes |
| Scoring | PASS ATTEMPTS / COMPLETIONS / TARGETS | 0 | yes (advanced, collapsible) |
| Scoring | PASS YARDS | 0.04 | yes |
| Scoring | INTERCEPTIONS | −2 | yes |
| Scoring | RUSH YARDS / RECV YARDS | 0.1 | yes |
| Scoring | RUSH TDS / RECV TDS | 6 | yes |
| Scoring | RECEPTIONS (RB / WR / TE) | 0.5 each | yes |
| Scoring | DEF SACKS / DEF INT / DEF FORCE FUMBLE / DEF RECOVER FUMBLE / DEF SAFETIES / DEF TOUCHDOWN | 1 / 2 / 1 / 1 / 2 / 6 | yes |
| Scoring | DEF points-allowed buckets | n/a | **hidden** — the workbook carries no per-team game distribution, so bucket scoring cannot be priced (verified: the file's own DST totals ignore buckets entirely) |
| Roster | STARTING QB / RB / WR / TE / DST / FLEX / SUPERFLEX | 1 / 2 / 3 / 1 / 1 / 1 / 0 | yes — **stored but inert in v1**; only `TEAMS` feeds a computation. UI labels them as such. |
| Roster | AUCTION BUDGET | 200 | yes — stored, unused in v1 (no auction dollars anywhere in v1) |
| Season | Season | 2026 | yes (advanced) — passed to ADP providers |

### 3.3 Scoring engine

`projectedPoints = Σ (stat × points-per-unit)` using the active settings:

- **QB**: `PAYD×payds + PATD×patd + INT×(−|int|) + RUYD×ruyd + RUTD×rutd` (all other categories price at 0 in the default table but remain formula-respectful).
- **RB/WR/TE**: the above rushing/receiving terms plus `REC × ppr(position)` and `RCYD×rcyd + RCTD×rctd`.
- **DST**: `SACKS×1 + INT×2 + FF×1 + FR×1 + SAF×2 + TD×6` (at default rates; editable). Points-allowed buckets are not applied in v1.

**Oracle test**: with the workbook's default settings, `projectedPoints` must reproduce the workbook's `Custom` values within `1e-6` relative error for all positions (the workbook is a self-consistent oracle). Open item: the QB master `FPS` differs from `Custom` (~5.6 pts for Josh Allen); the oracle targets `Custom`, and the discrepancy is investigated during implementation (§9).

## 4. Player Matching (file → ADP provider)

Match workbook players to provider players by **normalized name + team (+ position as tiebreaker)**:

- Normalize names: strip punctuation, suffixes (`Jr.`, `Sr.`, `II`, `III`), diacritics; case-fold.
- Team codes unified to a single internal mapping (`WSH`/`WAS` both accepted).
- DST: match by team abbrev ↔ full-name table (provider-side defenses keyed by team).
- Match quality: exact (name, team) preferred; (name, position) allowed when team differs by provider convention; unresolved players get `adp = null` (§2.2, §6.1).

The workbook's 5-digit `Player ID` is **opaque** — verified against live ESPN and Sleeper APIs that it belongs to neither ID space. It is stored for provenance and never used for matching (§9).

## 5. ADP Provider (ESPN, v1)

### 5.1 Contract

One provider interface (`fetchAdp({ season, variant, leagueId?, cookies? }) → Map<playerKey, { adp, rank, source }>`) implemented by `EspnProvider`; a `SleeperProvider` may implement the same interface later (Sleeper has no public ADP endpoint as of 2026-08 — out of scope for v1).

### 5.2 Modes

- **Public** (no credentials): ESPN's public per-player draft data for the season.
- **League-adjusted** (credentials provided): the league-scoped data, which reflects the league's scoring settings (and, where ESPN provides it, league-context weighting). On draft day, a league has no draft history, so this is effectively "ESPN ADP under my scoring" — still an improvement over generic public data.

**Exact endpoint/views to be confirmed in the Phase 0 discovery spike** (§9): probes show the public players endpoint is open and returns `draftRanksByRankType` (`rank`, `auctionValue`, variants `STANDARD`/`PPR`/`SUPERFLEX`/`ELIMINATION`) but no `averagePick` under the views tested so far. Fallback if no ADP-bearing view is found: use ESPN's `rank` per variant as the ADP signal.

**Variant selection** (by league scoring): PPR = 0 → `STANDARD`; PPR = 0.5 or 1 → `PPR`. (SUPERFLEX variant selection is future work, consistent with roster settings being inert in v1.)

### 5.3 Transport, caching, security

- **All** ESPN traffic flows through Tanstack Start **server functions** (Nitro `cloudflare-worker` build, running on Cloudflare Workers). The browser never calls ESPN directly. One uniform code path; no CORS exposure.
- An **in-memory cache** (a `Map` with a **1-hour TTL**, per isolate) holds provider responses keyed `(season, provider, variant, leagueId)`. Nothing else is persisted server-side. No server-side auth state. On Cloudflare Workers the cache is per-isolate and therefore best-effort; if a durable shared cache is required, swap this for a shared store (e.g. Upstash Redis) without changing the provider interface.
- **Credentials**: `espn_s2` and `SWID` are entered in the setup UI, held in **`sessionStorage` only** (never IndexedDB, never server-side), and passed as arguments to the league-adjusted server function per request. They are never logged and never written to the server cache.
- Failures surface as a banner with a retry action; the board remains fully usable without ADP data (columns blank, §6.1).

## 6. xADP, Deltas, and the Round Rule

### 6.1 Regression input

Per position, the set of matched players **with** ADP: `(projectedPoints → adp)`. Players without ADP are excluded from the fit and displayed with blank ADP/xADP/delta.

### 6.2 Fit

Per-position **log-linear** regression: `ln(adp) = a + b·points` via ordinary least squares, per position (QB/RB/WR/TE/DST independently). Then

`xadp = clamp(e^(a + b·points), 1, maxADP)`

(`maxADP` = the largest ADP observed for that position). The log form handles the long ADP tail; delta remains in absolute picks because the output is transformed back.

### 6.3 Deltas & round rule

- `delta = adp − xadp` (picks; positive = market drafts the player later than his projections imply).
- **Steal**: `delta ≥ teams` (at least one full round later than expected) → accented.
- **Reach**: `delta ≤ −teams` → dimmed.
- Everything else renders normally. Accenting is binary; no gradient in v1.

### 6.4 Display

Board columns: **ADP, Name, Position, Team, Projected Points, xADP, Delta**. Default sort: ADP ascending, nulls last. Players without ADP show blanks and sort to the bottom regardless of direction; a "N players without ADP" note is shown.

## 7. Persistence & Restore

**IndexedDB** (via `idb-keyval`), keyed:
- `file` — the raw uploaded `.xlsx` (required by spec; provenance + re-parse)
- `players` — the parsed player table
- `settings` — league settings (§3.2), including season; **never** cookies
- `adpCache` — `(season, provider, variant, leagueId)` → `{ data, fetchedAt }`, 1-hour TTL (client cache mirroring the server's in-memory cache)

**Restore flow**: on load, if `file` + `players` + `settings` exist → navigate straight to `/board` with everything restored; the board offers "Change file / settings" (→ `/`) and "Start over" (clears IndexedDB). Otherwise land on `/` with the dropzone. Uploading a new file replaces `file`/`players`, keeps `settings`, recomputes everything, and re-fetches ADP.

**Cookies**: `sessionStorage` only, wiped on tab close (§5.3).

## 8. UI & State

### 8.1 Routes (Tanstack Router, SPA mode)

- `/` — setup: dropzone, settings panel (§3.2), ESPN league-connect fields (leagueId, `espn_s2`, `SWID` — shown only when "Connect ESPN league" is toggled). ADP source shown as a static "ESPN" label with a disabled "Sleeper (coming soon)" hint. Successful setup auto-navigates to `/board`.
- `/board` — the draft board: data table (Tanstack Table + Mantine), position filter chips, search box, sortable headers, "Refresh ADP" button, steals/reaches summary.

### 8.2 State split

- **Search params** (the acceptance criterion): `q` (text), `pos` (comma-joined positions), `sort` (column key), `dir` (`asc`/`desc`), `steals` (`all` | `steals` | `reaches` | `none`). Board deep-links restore state; back/forward works.
- **Zustand**: loaded file, parsed players, settings (persisted), league-connect fields (ephemeral), which ADP mode is active.
- **TanStack Query**: ADP fetches (server functions) with the IndexedDB cache behind them; invalidated by "Refresh ADP" and settings changes that affect the variant key.

## 9. Open Items (tracked during implementation)

1. **ESPN ADP endpoint discovery** — find the view that exposes current-season ADP (`averagePick` or equivalent); fallback to `draftRanksByRankType.rank` per variant. Also confirm the league-scoped variant for the adjusted mode. (Front-loaded Phase 0; outcome recorded in the plan.)

   **Implementation-day re-probe (2026-08-10) — record for draft day:** the sandbox's public players endpoint returns a **fixed 50-player page** regardless of `offset`/`limit` (no full pool); `draftRanksByRankType.<variant>.rank` remains the only signal and all ranks are `published:false`. The provider's `proTeamId` space differs from classic ESPN numbering (derived map: 2=BUF, 11=IND, 12=KC, 14=LAR, 15=MIA, 16=MIN, 20=NYJ, 23=PIT, 28=WSH, 33=BAL; unverified ids skipped). League-scoped requests return the same fixture even without credentials in the sandbox; real cookie-gated behavior is preserved in the provider. **Re-probe both pagination and the team-ID space against live ESPN on draft day and update `TEAM_ID_TO_ABBREV` in `src/lib/adp/espn.ts`.**
2. **QB `FPS` vs `Custom` discrepancy** (~5.6 pts for Josh Allen) — **investigated:** the engine reproduces `Custom` exactly at workbook-default settings for all 479 players; master `FPS` is a separate 0-PPR formula (~5.57 pt higher for Josh Allen, appears computed from rounded inputs). The oracle targets `Custom`; the discrepancy is documented in `tests/scoring.test.ts`.
3. **Workbook `Player ID` space** — identified as not-ESPN, not-Sleeper; left opaque. If the user later identifies the space and it matches an ADP source, ID-based matching becomes an option (spec change would be required).

## 10. Deployment & Stack

- **Runtime/toolchain**: [nub](https://nubjs.com/) — a TypeScript-first Node.js toolkit that runs `.ts`/`.tsx` directly on stock Node and runs `package.json` scripts via `nub run …`. Tanstack Start in SPA mode over a Nitro `cloudflare-worker` build; **deployed to Cloudflare Workers** via `wrangler deploy`. Dev: `nub run dev` (Vite). Test: `vitest`.
- **Lint/format**: `oxlint` + `oxfmt` (Rust-based). `oxlint` runs **`eslint-plugin-react-you-might-not-need-an-effect`** via its ESLint-compatible JS-plugin layer (`.oxlintrc.json` → `jsPlugins`), enforcing the React docs' [You Might Not Need An Effect](https://react.dev/learn/you-might-not-need-an-effect) guidance: `no-derived-state`, `no-chain-state-updates`, `no-event-handler`, `no-adjust-state-on-prop-change`, `no-reset-all-state-on-prop-change`, `no-pass-live-state-to-parent`, `no-pass-data-to-parent`, `no-initialize-state`, `no-empty-effect`, plus the rest of the plugin's rule set. Rules are listed explicitly in `.oxlintrc.json` — oxlint does not apply ESLint `recommended` configs. **Type-aware linting is enabled** (`.oxlintrc.json` → `options.typeAware: true`, via the `oxlint-tsgolint` backend; stable since tsgolint v7, requires TypeScript 7+ and a root `tsconfig.json`, which oxlint discovers per file), adding the semantic `typescript/*` rules (`no-floating-promises`, `no-misused-promises`, …).
- **Typecheck**: `nub run check` runs `tsc --noEmit` — full-program type checking via TypeScript against `tsconfig.json`. (Nub strips types when transpiling; it does not check them.) This is the typecheck gate; oxlint's experimental `--type-check` diagnostics mode is not used — oxlint's type-aware mode is lint-only.
- **Stack**: React 19, Tanstack Start (SPA) + Router, Tanstack Query, Tanstack Table, Zustand, Vite 8, Nitro (`cloudflare-worker`), Mantine, Zod, `@e965/xlsx`, `idb-keyval`. Dev tooling: `oxlint` + `eslint-plugin-react-you-might-not-need-an-effect` + `oxlint-tsgolint` (type-aware backend), `oxfmt`, `vitest`, `tsc --noEmit`. Dependencies via `package.json`, installed with `nub install`.

## 11. Acceptance Criteria

1. Drag-and-drop `.xlsx` upload parses the workbook and persists the raw file to IndexedDB.
2. League settings (PPR, league size, scoring table, season) recompute Projected Points, xADP, and deltas live, without a server round-trip.
3. With workbook-default settings, recomputed Projected Points reproduce the workbook's `Custom` values (oracle test) for all positions.
4. ADP is fetched through server functions from ESPN; the league-adjusted path is used when credentials are provided and the public path otherwise; failures surface with a retry and the board stays usable.
5. The board shows ADP, Name, Position, Team, Projected Points, xADP, and Delta; default-sorted by ADP with nulls last.
6. Steals (`delta ≥ teams`) are accented and reaches (`delta ≤ −teams`) are dimmed.
7. Filter/search/sort state (`q`, `pos`, `sort`, `dir`, `steals`) is managed with search params; board deep-links restore that state.
8. Reloading restores the session from IndexedDB without re-uploading; "Start over" clears it.
9. `espn_s2`/`SWID` are never persisted server-side or in IndexedDB.
10. `nub run dev`, `nub run lint` (runs `oxlint` with `eslint-plugin-react-you-might-not-need-an-effect` and type-aware linting enabled), `nub run fmt` (runs `oxfmt`), `nub run check` (runs `tsc --noEmit`), and `nub run test` (runs `vitest`) all pass.
