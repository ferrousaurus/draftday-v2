# Draft Day — Implementation Plan

Status: planned (skeleton repo). Source of truth: `docs/specs/init.md` (the spec) and `.agents/skills/reading-athletic-projections/SKILL.md` (workbook format). This plan sequences the spec into reviewable milestones, each with tasks, file layout, verification, and the spec/acceptance-criteria sections it advances. If a conflict ever arises between this plan and the spec, **the spec wins**.

---

## 0. Current state (repo snapshot, 2026-08-11)

| Area | State |
| --- | --- |
| Routes | `src/routes/__root.tsx`, `src/routes/index.tsx` ("Hello, world!"), `src/router.tsx`, generated `routeTree.gen.ts` |
| Toolchain | TanStack Start SPA + Nitro `deno-deploy` preset; React 19, Mantine, Query/Table/Router, Zustand, zod, `@e965/xlsx`, `idb-keyval` already in `package.json` |
| Config | `vite.config.ts` (tanstackStart + nitro + viteReact), `vitest.config.ts` (varlock plugin), `oxlint.config.ts` (type-aware + jsPlugins), `oxfmt.config.ts`, `tsconfig.json` (`#/*` alias, `.ts` imports, `deno.d.ts` in `types`), `deno.json` (allowScripts only), `.env.schema` (matches §10.2: 3 vars, decorators, no values), `.env.local` present |
| Gates | `deno task check` passes; `lint` passes (warnings); `fmt:check` **fails** (committed source is double-quoted); `deno task test` **broken** (vitest crashes loading `vite.config.ts`: `ReferenceError: module is not defined`) |
| Tests | none; no `tests/` dir; no `tests/fixtures/` |
| Resources | `resources/2026-FFB-Projections-0805-1.xlsx` present but **untracked** (oracle tests must skip cleanly without it) |

## 1. Guiding principles

1. **Headless-first.** All domain logic (types, normalization, settings, scoring, VORP/regression, parsing, ADP parsing, cache math) is pure and UI-free, built and tested before any route work.
2. **Spec-derived types.** Data shapes come from §2/§3.2 tables verbatim; nothing new is invented.
3. **Server functions are the only ADP path** (§5.1): the browser never calls ESPN or beatadp.com directly.
4. **Test discipline.** Every headless module gets unit tests. Fixtures are committed under `tests/fixtures/`. Anything requiring the real workbook or live credentials (oracle, kona probes) **skips cleanly when absent** (§3.3).
5. **Gates stay green.** `deno task lint`, `check`, `fmt:check` are run after every milestone (with `deno.d.ts` regenerated); `deno task test` is un-broken first in M0 and stays green.
6. **No credential leakage, ever.** `espn_s2`/`SWID` live only in IndexedDB (client) and are passed per-request to server functions; nothing credential-related is cached or logged server-side (§5.3, §5.5).

Dependency map:

```
M0 toolchain ──> M1 domain ──> M2 parse+score ──> M3 VORP/xADP math
                        │                └──────────> M4 persistence
                        └──> M5 providers (parallelizable after M1)
M6 setup UI (needs M2, M4, M5) ──> M7 board UI (needs M3, M6)
M8 league lock (needs M5, M6) ──> M9 acceptance sweep
```

M4 and M5 can proceed in parallel once M1 lands. M3 needs M2 (projectedPoints). M7 needs M3 (board math), M5 (ADP), and M6 (state entry).

---

## M0 — Toolchain stabilization

**Goal:** all four `deno task` gates run clean on the skeleton; test infrastructure exists.

**Depends on:** nothing.

**Tasks:**

1. **Fix `deno task test`.** Diagnose the vitest crash (`ReferenceError: module is not defined` while loading `vite.config.ts` — react CJS through vite's module-runner; per AGENTS.md, deleting `vite.config.ts` makes vitest run clean). Known facts: `vitest.config.ts` already exists separately and loads `varlockVitePlugin` fine. Root cause is TBD; acceptance is `deno task test` exiting 0 **with** the committed `vite.config.ts` in place (dev/build still need it). If the module-runner crash is genuinely irreducible, follow the documented workaround (exclude `vite.config.ts` from vitest's config load) and record the app-scoped exception in AGENTS.md — but only as a last resort.
2. **Add `varlockVitePlugin` to `vite.config.ts`** (spec §10.2 requires it in both configs; currently dev/build skip env validation).
3. **Verify `.env.schema`** parses under Varlock and that `varlock load` succeeds from `.env.local`; add a `varlock scan` invocation to CI (AC 14).
4. **Normalize formatting once.** Run `deno task fmt` so `fmt:check` passes and stays a gate from here on (AGENTS.md notes the committed source is double-quoted).
5. **Scaffold `tests/`** with `tests/fixtures/`; confirm vitest picks up a trivial test.
6. **Create `docs/plans/` convention** (this file) — done.

**Verify:** `deno task -A lint && deno task -A check && deno task -A fmt:check && deno task -A test` all exit 0; `varlock load` and `varlock scan` succeed.

**Spec:** §10.1–10.2, §11 AC 13–14.

---

## M1 — Domain foundation

**Goal:** types, name/team normalization, settings schema with defaults and derived values — the vocabulary every later milestone uses. No UI, no I/O.

**Depends on:** M0.

**Tasks:**

1. **`src/domain/types.ts`** — `Position` (`QB|RB|WR|TE|DST`), `PlayerRecord` per §2.1 (including `playerId: number | null`, `ref`, `filePoints`), derived-values shape §2.2 (`projectedPoints`, `vorp`, `adp` with `source: "league" | "platform" | "consensus"`, `xadp`, `delta`), `ParsedTable`/ADP-map types shared with M5, `AdpSource` union.
2. **`src/domain/names.ts`** — `normalizeName`: strip punctuation, suffixes (`Jr.`, `Sr.`, `II`, `III`), diacritics, case-fold (§4).
3. **`src/domain/teams.ts`** — the single internal team-code mapping spanning workbook codes (mixed 2/3-letter), BeatADP 2-letter, ESPN `proTeamId` (classic numbering, verified values in §5.3), and `WSH`/`WAS` unification; plus the shipped 32-team nickname↔full-name table for DST matching (§4). One canonical map, no per-provider exceptions outside this module.
4. **`src/domain/settings.ts`** — zod schema for the full settings object (§3.2 table): platform, league-aware, leagueId, `espn_s2`/`SWID`, draftType (platform-scoped options: ESPN `REDRAFT` only; Yahoo `REDRAFT|BEST_BALL`; Sleeper `REDRAFT|BEST_BALL|DYNASTY`), PPR chip + canonical RECEPTIONS triple, league size, pass TD, all scoring rates, roster counts, auction budget, season; defaults exactly per §3.2 (PPR 0.5, size 12, pass TD 4, PASS YARDS 0.04, INT −2, RUSH/RECV YARDS 0.1, TDs 6, DST 1/2/1/1/2/6, roster 1/2/3/1/1/1/0, budget 200, season 2026); Zod sanity bounds (league size 2–32, RECEPTIONS 0–2, yards 0.01–0.2, TD rates 0–10, INT −5…0, DST 0–10) — validation-only, never UI-blocking; negative rates stored signed, no sign special-casing in the engine.
5. **`src/domain/settings.ts` (derived)** — pure helpers: `deriveQbType` (`STARTING QB + STARTING SUPERFLEX ≥ 2 → "2QB"` else `"1QB"`), `deriveScoringFormat` (`0→STANDARD`, `0.5→HALF_PPR`, `1→PPR`, custom/divergent→`PPR`), the **PPR chip display rule** computed from the RECEPTIONS triple (chip shows `Custom` whenever the three diverge or take a non-0/0.5/1 value; selecting 0/0.5/1 writes all three), and the **provider keys**: BeatADP `(scoringFormat, draftType, qbType)` and kona `(season, leagueId, qbType)` (§3.2, §5.2, §5.3).
6. **`src/domain/time.ts`** — `msUntilNextUtcMidnight(now: Temporal.Instant = Temporal.Now.instant()): number` (§5.2, §7; shared by server KV cache and client `adpCache`).

**Verify:** `tests/settings.test.ts` (defaults match §3.2 exactly; bounds accept/reject; PPR chip rule incl. 0.75 triple → `Custom`; draftType option sets per platform), `tests/names.test.ts` (suffixes, diacritics, punctuation), `tests/teams.test.ts` (WSH/WAS, full 32-team round-trip, proTeamId spot-checks from §5.3: 1 ATL, 2 BUF, 22 ARI, 34 HOU…), `tests/time.test.ts` (midnight edge, Temporal default arg). `deno task test` green.

**Spec:** §2, §3.2, §4, §5.1/5.2/5.3 key shapes, §7.

---

## M2 — Workbook parsing & scoring engine

**Goal:** upload → parsed `PlayerRecord[]` per §3.1, and `projectedPoints` per §3.3, proven against a committed fixture and the oracle.

**Depends on:** M1.

**Tasks:**

1. **`src/parser/workbook.ts`** — parse exactly the seven sheets in §3.1 (hidden masters `QB`, `RB`, `WR`, `TE`, `DST1`; visible `DST`; hidden `Rankings`), reading **cached cell values only** (never recompute formulas — broken external link; cached values authoritative, §3.1). Column sets per sheet exactly as listed (e.g. QB: `QBRef, Player, TM, BYE, PATT, CMP, PAYD, PATD, INT, RUAT, RUYD, RUTD, FPS, Custom, AUC$`). Skip rules: empty/`"0"`/placeholder `Player`, `#N/A` cached cells. No kickers. `AUC$` read for provenance, not retained.
2. **DST merge** — stat projections come **only** from visible `DST` (`Ref, TEAM, ABBREV, BYE, SACKS, INT, FORCED FUMBLE, RECOV'D FUMBLE, SAFETIES, DEF TD, …`), merged into `DST1` records by `ABBREV`/`TEAM`; safeties empty everywhere; buckets ignored (§3.2, §3.3).
3. **`Rankings`** — read `Player ID` (opaque, stored, never used for matching) and use Name/Team/Position as a cross-check; normalize its `WAS` to the internal code (§3.1, §4).
4. **`src/parser/parseWorkbook.ts`** — orchestration entry: `ArrayBuffer` → `PlayerRecord[]` with `id = ${position}:${name}` (§2.1).
5. **`src/scoring/engine.ts`** — `projectedPoints = Σ(stat × rate)` per §3.3: QB `PAYD×payds + PATD×patd + INT×intRate + RUYD×ruyd + RUTD×rutd`; RB/WR/TE adds `REC × ppr(position) + RCYD×rcyd + RCTD×rctd`; DST `SACKS×1 + INT×2 + FF×1 + FR×1 + SAF×2 + TD×6` at default rates, editable; all categories formula-respectful at 0; no sign special-casing.
6. **Committed synthetic fixture** — a small hand-built `.xlsx` under `tests/fixtures/` (built with `@e965/xlsx` via a one-off script per the xlsx skill, committed as binary) covering: all seven sheets, a skip-case row, DST merge by abbrev, `WAS` vs `WSH`, and known stat rows whose `Custom` values pin the engine.
7. **`tests/scoring.test.ts`** — (a) engine pins against the fixture at workbook-default settings; (b) **oracle test**: read the real workbook's `Settings` sheet (test-only; the app never reads it), run the engine under those settings, assert `projectedPoints` reproduces `Custom` within `1e-6` relative error for all positions — **skips cleanly when the workbook is absent** (it's untracked). Document the QB master `FPS` vs `Custom` discrepancy (~5.6 pts for Josh Allen) in this file; oracle targets `Custom`.
8. **`tests/parser.test.ts`** — fixture-driven: seven-sheet coverage, skip rules, DST merge, `Rankings` cross-check, `WAS` normalization, `id` shape.

**Verify:** `deno task test` green incl. oracle (runs locally since the workbook exists; must skip cleanly on a fresh clone). `deno task lint`/`check` green.

**Spec:** §2.1, §3.1, §3.3, §4, §11 AC 1, 4.

---

## M3 — VORP, xADP, deltas, round rule

**Goal:** the §6 math as pure functions — the board's value layer — validated against synthetic fits.

**Depends on:** M2 (projectedPoints via engine; player table).

**Tasks:**

1. **`src/domain/vorp.ts`** — `replacementBaseline(position, teams, roster)` per the §6.1 table: QB `TEAMS × (STARTING QB + SUPERFLEX)`, RB/WR `TEAMS × (STARTING + FLEX/2)`, TE `TEAMS × STARTING TE`, DST `TEAMS × STARTING DST`; odd team counts round **up** to the next even before ranks compute (11→12, 9→10); ranks clamp to `[1, position count]`; `vorp = projectedPoints − baseline`, may be negative. Sanity-pin defaults: 12 teams / 1·2·3·1 + 1 flex → QB12, RB30, WR42, TE12, DST12. Never use the workbook's VORP column.
2. **`src/domain/regression.ts`** — per-position OLS for `ln(adp) = a + b·vorp` (b < 0) on the **positive-VORP + ADP** subset only (§6.2: probe-validated log-linear is best in that region; below-replacement players add no signal); then `xadp = clamp(e^(a + b·vorp), 1, maxADP)` with `maxADP` = largest observed ADP for the position (below-replacement players clamp to the board tail). **Sample rule:** ≥5 positive-VORP players with ADP per position or the whole position yields `xadp = null` + footer note text ("{position} xADP unavailable: fewer than 5 positive-VORP players with ADP"); degenerate fits (zero variance in VORP or ln(ADP)) also yield null + note, never a garbage line. DST in BeatADP modes: no ADP samples at all → no fit → blank columns (§5.2, §6.2).
3. **`src/domain/delta.ts`** — `delta = adp − xadp` (absolute picks); `steal: delta ≥ teams`; `reach: delta ≤ −teams`; binary accenting, no gradient (§6.3).
4. **`src/domain/board.ts`** (optional glue) — `buildBoard(players, settings, adpMap) → rows` computing projectedPoints → VORP → fit → xADP → delta in one pass; the single function the board and the store use, so recompute stays consistent (§1 live-recompute requirement).

**Verify:** `tests/vorp.test.ts` (defaults, odd-team round-up, clamps, negative VORP), `tests/regression.test.ts` (fit recovers a known line on synthetic data; sample rule at 4 vs 5 players; zero-variance degenerates; clamp behavior; below-replacement → maxADP), `tests/delta.test.ts` (thresholds at exactly ±teams). All green.

**Spec:** §1, §2.2, §6.1–6.3, §11 AC 3, 7, 8.

---

## M4 — Persistence & restore

**Goal:** IndexedDB as canonical store; Zustand working state with a custom IDB persister; restore/"Start over"/re-upload flows (§7). No localStorage anywhere.

**Depends on:** M1.

**Tasks:**

1. **`src/store/idb.ts`** — thin typed wrapper over `idb-keyval` with the §7 keys: `file` (raw `.xlsx`), `players`, `settings` (incl. `espn_s2`/`SWID` — IndexedDB-only, never server-side), `adpCache` (`(provider key) → { data, fetchedAt }`, **client-side midnight-UTC expiry** via the §7 `msUntilNextUtcMidnight` helper, enforced at read), `drafted` (set of ids).
2. **`src/store/persistAdapter.ts`** — Zustand `persist` storage implementing `getItem`/`setItem`/`removeItem` over the idb wrapper (the §7 custom IndexedDB adapter).
3. **`src/store/appStore.ts`** — Zustand store with slices: loaded file, parsed players, settings, drafted set, active ADP mode; persisted via the adapter. Actions: `uploadWorkbook` (replace file/players, **keep settings** — the workbook never pre-fills or overrides settings, §7), `updateSettings`, `toggleDrafted`, `startOver` (clears IndexedDB), restore bookkeeping.
4. **Restore flow logic** — on app load: `file` + `players` + `settings` present → land on `/board` fully restored; otherwise `/` with the dropzone; board offers "Change file / settings" (→ `/`) and "Start over" (§7).
5. **`src/domain/board.ts` hookup** (from M3) — the store exposes players + settings; board rows are derived, never stored (react-you-might-not-need-an-effect: no derived state in effects; compute via selectors).

**Verify:** `tests/persistence.test.ts` — adapter round-trip with a stubbed idb-keyval surface (the adapter only needs `getItem`/`setItem`/`removeItem`; no real IndexedDB required — add `fake-indexeddb` only if integration semantics are actually needed, defer that decision); restore-flow decision logic; upload-keeps-settings; startOver clears all keys; `adpCache` expiry check at midnight boundary. `deno task test` green.

**Spec:** §7, §8.2, §11 AC 10, 11, 12.

---

## M5 — ADP providers & server functions

**Goal:** the §5 contract with two implementations — BeatADP (scrape + Deno KV cache) and kona (league-aware ESPN, never cached server-side) — all traffic through TanStack Start server functions.

**Depends on:** M1 (provider keys, settings types). Parallel with M3/M4.

**Tasks:**

1. **`src/server/adp.ts`** — the provider contract §5.1:
   `fetchAdp({ season?, platform, leagueAware, leagueId?, cookies?, draftType, qbType, scoringFormat }) → Map<playerKey, { adp: number | null, rank?: number, source: "league" | "platform" | "consensus" }>`. Routing: `leagueAware && platform === "ESPN"` → kona (reads only `{season, leagueId, cookies, qbType}`; PPR variant comes from the league response, never `scoringFormat`); everything else → BeatADP (reads only `{platform, draftType, qbType, scoringFormat}`). Expose via `createServerFn` (TanStack Start server functions) — the browser never calls the providers directly.
2. **`src/server/beatadp/fetch.ts`** — `https://www.beatadp.com/platform-adp?scoringFormat={PPR|HALF_PPR|STANDARD}&draftType={REDRAFT|DYNASTY|BEST_BALL}&qbType={1QB|2QB}`; server-side HTML fetch.
3. **`src/server/beatadp/parse.ts`** — **isolated HTML-table parser** (columns `# | Player (name+team) | Consensus | Sleeper | ESPN | Yahoo | Underdog | FantasyPros`) returning `ParsedTable` with all platform columns; value selection: platform column, `—` → Consensus fallback tagged `source: "consensus"`; both missing → `adp: null`; empty page (unsupported combos, e.g. 2QB/PPR) → typed empty result. **No JSON API; parsing isolated in one module, fixture-tested** (§5.2, §9.4).
4. **`src/server/kv.ts`** — promise-latch memo: `let kvPromise: Promise<Deno.Kv> | null` around `Deno.openKv()` (one-time cost, no top-level await); dev/tests get the in-memory backing with identical API; prod auto-connects to the app's assigned KV DB (dashboard assignment is out-of-band, §9.6). Cache key `["beatadp", scoringFormat, draftType, qbType]`, value `{ data: ParsedTable, fetchedAt: number }`, `expireIn` = `msUntilNextUtcMidnight()` (midnight-UTC daily expiry; non-strict per Deno KV). **Empty results cached under the same key/TTL — no special-casing** (§5.2). This is the **only** server-side persistence.
5. **`src/server/kona.ts`** — per §5.3: endpoint `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{leagueId}?view=kona_player_info` (required; `fantasy.espn.com` redirects to marketing); `X-Fantasy-Filter` with `filterStatus: [FREEAGENT, WAIVERS]`, `filterSlotIds: [0,2,4,6,16]`, `filterRanksForScoringPeriodIds: [1]`, `sortDraftRanks.sortPriority 100 / sortAsc true / value = variant`, `limit: 1000`; `Cookie: swid=…; espn_s2=…`. Variant selection: `SUPERFLEX` if league `qbType` is `2QB`, else `PPR` if league PPR ≠ 0 (fractional incl.), else `STANDARD`. ADP = `player.ownership.averageDraftPosition`; fallback signal = `player.draftRanksByRankType.<variant>.rank` (`published: false` is cosmetic, never gates); `proTeamId` mapped via the M1 team table; `defaultPositionId` (1/2/3/4/16). Also parse and return the league `settings` object `{ size, scoringSettings, rosterSettings, isKeeper }` for M8. **Never cached server-side — no KV, no in-memory Map** (§5.3: Deno KV is durable/replicated; per-instance memory is unreliable; nothing authenticated leaves the client). 401/absent cookies → typed auth failure (M8 degrades to BeatADP ESPN column).
6. **Client-side `adpCache`** (with M4) — kona responses cached only in IndexedDB keyed `(season, leagueId, qbType)` — never by credentials — with the same midnight-UTC expiry.

**Verify:** `tests/beatadp-parse.test.ts` with committed fixture HTML (`tests/fixtures/beatadp-*.html`): column extraction, consensus fallback, `—` handling, empty-page detection; `tests/kv-cache.test.ts` (in-memory KV: write/read, expireIn ≈ midnight, empty-result caching, promise-latch single-open); `tests/kona.test.ts` — live-probe against `VITEST_ESPN_S2`/`VITEST_SWID`/`VITEST_ESPN_LEAGUE` (env-injected by the Varlock vitest plugin), asserting the §5.3 field shapes and settings mapping, **skipping cleanly when credentials are absent**; server-function wiring smoke-tested via the dev server.

**Spec:** §5.1–5.3, §5.5, §7, §9.4–9.5, §11 AC 5, 6, 12.

---

## M6 — Setup route (`/`)

**Goal:** the §3.2 settings experience end-to-end: dropzone upload, platform/league-aware selection, full settings panel, live recompute, auto-navigate to `/board`.

**Depends on:** M2 (parse), M4 (store), M5 (ADP refetch on `scoringFormat` change).

**Tasks:**

1. **Mantine shell** — theme provider + AppShell in `__root.tsx`; layout chrome.
2. **Dropzone** — `@mantine/dropzone` for `.xlsx`; upload → parse (M2) → persist file+players (M4) → settings panel enabled; parsing errors surfaced inline.
3. **Platform & league-aware controls** — platform segmented selector (ESPN/Yahoo/Sleeper); league-aware toggle **hidden for Yahoo**, shown for ESPN/Sleeper; conditional fields: ESPN league-aware → `leagueId` + `espn_s2` + `SWID` (password inputs), Sleeper league-aware → `leagueId` only (§8.1). Credentials write to the persisted settings slice (IndexedDB-only).
4. **draftType select** — options per platform (§3.2); ESPN's select is inert (`REDRAFT` only). (League-locking arrives in M8.)
5. **Settings panel** — PPR chip segmented `0 / 0.5 / 1 / Custom`; `Custom` reveals the per-position RECEPTIONS stepper (RB/WR/TE, 0–2); chip display computed from the triple (M1 helper), no stored chip state. Pass TD segmented 4/6; PASS YARDS segmented 0.04/0.05/0.1; league size stepper; all scoring rates as free steppers (Zod-validated, non-blocking); advanced collapsible group: PASS ATTEMPTS/COMPLETIONS/TARGETS, season; AUCTION BUDGET stored but inert (§3.2).
6. **Derived read-only display** — `qbType` and `scoringFormat` shown read-only from the M1 helpers (§3.2).
7. **Live recompute wiring** — board rows derived via the M3 `buildBoard` selector on (players, settings, adpMap): any settings change recomputes Projected Points, VORP, xADP, deltas client-side with **no server round-trip**; a `scoringFormat` change (chip, Custom stepper, or — later — league lock) additionally **refetches ADP** (Query invalidation, §8.2); season changes refetch only in league-aware ESPN (M8), never for BeatADP (§1, §5.3).
8. **Auto-navigate** — successful setup → `/board` **immediately**, without waiting for ADP (board shows skeletons, §8.1).

**Verify:** manual pass in dev browser for the control behaviors (chip/Custom/segments, hidden Yahoo toggle, conditional fields, validation non-blocking, read-only derived values); unit tests for any new form-adjacent pure logic; lint/check/fmt gates green. TanStack Router search params for the board come in M7.

**Spec:** §1, §3.2, §8.1, §11 AC 2, 3.

---

## M7 — Board route (`/board`)

**Goal:** the interactive draft board per §6.4/§8: table, sorting/filtering via search params, ADP loading states, source labeling, steals/reaches, draft tracking.

**Depends on:** M3 (math), M5 (ADP via Query), M6 (state entry).

**Tasks:**

1. **Data table** — TanStack Table + Mantine: columns **ADP, Name, Position, Team, Projected Points, VORP, xADP, Delta** (§6.4); default sort ADP ascending, nulls last; sortable headers (VORP/Points/xADP/Delta sortable too); position filter chips; search box; steals/reaches summary counts reflecting current filters (§6.4).
2. **Search params** — `q`, `pos` (comma-joined), `sort`, `dir`, `steals` (`all|steals|reaches|none`) via `route.validateSearch` (zod); board deep-links restore state; back/forward works; **draft tracking is not in search params** (§8.2, AC 9).
3. **ADP loading states** — while ADP fetches: ADP column skeleton; xADP column skeleton while ADP is being fetched; Projected Points and VORP render immediately; Delta renders once both are present (§8.1). Players without ADP: blanks + sorted to the bottom regardless of direction (§6.4).
4. **Source labeling & footnotes** — board header line "ADP: ESPN league · fetched 14:32" / "ADP: BeatADP Yahoo · fetched 14:32"; Consensus-fallback cells carry a superscript † with tooltip + column-header legend; "N players without ADP" note expanding to the list of names/teams/positions (§4, §6.4); DST footnote in BeatADP modes ("Team defenses aren't tracked by BeatADP") with DST rows blank and bottom-sorted; 2QB-empty banner ("BeatADP has no ADP data for 2QB/PPR — try 1QB or another scoring format", §5.2).
5. **Draft tracking** — click row to mark drafted, click again to undo; struck-through/dimmed rendering; per-position counter strip (drafted vs. starter slots); persisted under `drafted` (§7, §8.1, AC 10).
6. **Refresh ADP & failures** — "Refresh ADP" button invalidates the Query; failures surface as a banner with retry; board stays fully usable with blank columns (§5.5, §8.2).
7. **TanStack Query wiring** — ADP query keyed by the §5 provider key with the IndexedDB `adpCache` behind it; invalidated by refresh and by settings changes that alter the key (§8.2).

**Verify:** dev-browser walkthrough of AC 7–10: deep-link/back-forward search-param round-trip, skeleton→data transition, consensus indicator, steals/reaches accenting at ±teams, draft counters, refresh, failure banner (simulate by blocking the server function). All gates green.

**Spec:** §5.5, §6.4, §8.1–8.2, §11 AC 6, 7, 8, 9, 10.

---

## M8 — League-aware lock & degradation

**Goal:** the league as settings authority with the exact §5.4 lock scope, plus the §5.5 degradation/credential-restore behavior.

**Depends on:** M5 (kona settings object, Sleeper fetch), M6 (form).

**Tasks:**

1. **Sleeper settings fetch** — `https://api.sleeper.app/v1/league/{leagueId}` (public, no auth): `settings.scoring` and `settings.roster` mapped to the app model; league type `redraft/dynasty/keeper/best_ball` → draftType (**keeper → `REDRAFT`**, **best_ball → `BEST_BALL`**); lineup → qbType derivation (§5.4).
2. **ESPN settings from kona** — the §5.3 `settings` object: `size` → league size; `scoringSettings` (rule-id map, pinned by the live probe + fixture tests) → scoring rates; **single PPR value → all three RECEPTIONS fields** (fractional, e.g. 0.75 → chip `Custom`, `scoringFormat` `PPR`, §3.2); `rosterSettings` (slot-id map) → starter counts; `isKeeper` → draftType `REDRAFT` (§5.4).
3. **Lock scope (exactly)** — when league-aware is active: Core (PPR, league size, pass TD), the full scoring table, roster fields, and draftType are locked and sourced from the league; **season stays editable**; advanced fields the league doesn't model (pass attempts/completions/targets) stay editable; AUCTION BUDGET stays editable (inert in v1). Un-toggling league-aware unlocks everything **with values preserved**. Setting values, not just UI, come from the league (§5.4).
4. **Fetch failure** — bad leagueId / 401 / not found → banner with retry; form stays unlocked/editable, never blocked (§5.4).
5. **No-credentials restore & degradation** — credentials persist with settings, so a reopened tab restores league-aware mode; when credentials are absent (never entered, cleared, or removed by "Start over") or rejected (401), the board degrades to BeatADP's ESPN column with the exact banner text ("League-aware credentials were cleared — showing BeatADP's ESPN ADP. Reconnect your league in settings") and the ADP-source label reflects the degradation; previously locked settings unlock with values preserved; re-entering valid credentials re-locks them from the league (§5.5). Sleeper unaffected (public `leagueId` persists).
6. **Credential hygiene audit** — `espn_s2`/`SWID` only in IndexedDB settings, passed per-request to the kona server function, never logged/cached/server-stored (§5.3, §5.5, AC 12); grep-based check in the acceptance sweep.

**Verify:** dev-browser scenarios: ESPN league-aware lock/unlock (valid creds), fractional PPR chip behavior, Sleeper lock, fetch-failure banner + unlocked form, clear-credentials → degraded board + banner + re-lock; kona/Sleeper fixture tests (skip-cleanly without env/league). AC 2, 3, 5, 11.

**Spec:** §3.2 (qbType/scoringFormat derivation), §5.3–5.5, §11 AC 2, 3, 5, 11, 12.

---

## M9 — Acceptance sweep & hardening

**Goal:** AC 1–14 pass; docs current; CI in place; known limitations surfaced.

**Depends on:** M0–M8.

**Tasks:**

1. **Walk the 14 acceptance criteria** one by one against the running app and the test suite; fix gaps with targeted tests (the AC list is the checklist; every AC maps to a test or a scripted manual check).
2. **CI** — run `deno task -A lint / check / fmt:check / test` (the `-A` form where permission prompts would block non-interactively, §11 AC 13) plus `varlock scan` (AC 14); supply the three `VITEST_ESPN_*` vars as CI secrets so kona tests run where available and skip otherwise.
3. **Edge-case pass** — re-upload replacing file/players while keeping settings; start-over mid-session; ADP arriving after a settings change mid-view; 0/empty ADP modes; odd league sizes; custom PPR triples; draft toggling with filters active.
4. **Documentation** — update AGENTS.md where behavior changed (e.g., any M0 test-runner exception); verify spec §9 limitations are reflected in-app (BeatADP scraping fragility note, 2QB coverage banner, deployment post-v1 — no in-repo deploy config by design, §9.6).

**Verify:** all gates green on a clean clone (workbook absent → oracle + kona tests skip; present → run); scripted AC walkthrough recorded.

**Spec:** §9, §11 (all).

---

## 2. Cross-cutting constraints (from lint config & AGENTS.md)

- No `any`, no non-null assertions, no nested ternaries; `type` over `interface`; no `React.FC`; function components only; `exhaustive-deps` is an error; one component per file (warn).
- `react-you-might-not-need-an-effect`: no derived state in effects, no state-from-prop resets, no event-handler-in-effect — board rows and chip display are **selectors**, never effect state.
- oxfmt style (single quotes, semis, width 120) — run `deno task fmt` before committing; keep `fmt:check` green from M0 on.
- `deno.d.ts` regenerates before `lint`/`check`/`test` (chained in the task scripts) — needed for `Deno`, `Deno.Kv`, `Temporal` typings incl. the KV promise-latch (`no-floating-promises`).
- Imports use the `#/*` alias or relative paths; `.ts` extensions allowed.
- New dependencies (if any — prefer none) via `deno install`, never npm/pnpm/yarn; lockfile `deno.lock` stays committed.

## 3. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Vitest/vite.config.ts module-runner crash resists fixing (M0) | Documented workaround path exists (exclude vite.config.ts from vitest config load); dev/build unaffected; record app-scoped exception in AGENTS.md only if forced |
| BeatADP markup changes break the scraper (§9.4) | Parser isolated in one module + fixture tests; KV cache limits fetch frequency; shape re-verified per cache miss |
| Kona credentials become invalid mid-session | §5.5 degradation path: 401 → BeatADP ESPN column + banner + settings unlock; tested in M8 |
| ESPN kona API drift (headers/fields) | Live-probe tests pin §5.3 shapes (skip cleanly without creds); settings rule/slot-id mapping fixture-tested |
| Real workbook untracked / absent in CI | Oracle + kona tests skip cleanly; synthetic fixture pins parser/engine in CI (§3.3) |
| Deno KV `expireIn` non-strict expiry | Midnight expiry is a freshness policy, not a correctness bound; client `adpCache` same policy (§5.2, §7) |

## 4. Definition of done

- All milestones M0–M9 complete; every task's verification listed; all four `deno task` gates green; `deno task test` green with fixtures, oracle, and skip-cleanly behavior as specified.
- Acceptance criteria 1–14 (§11) each demonstrably satisfied (test or scripted manual check), recorded in M9.
- This plan updated to reflect any spec-adjacent discoveries (like M0's root-cause finding) before the session closes.
