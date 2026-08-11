---
name: reading-athletic-projections
description: Use to understand the format of @resources/2026-FFB-Projections-*.xlsx
---

# The Athletic 2026 FFB Projections — Workbook Shape Reference

> Source file: `resources/2026-FFB-Projections-0805-1.xlsx`
> This document is the canonical description of that workbook. A future session should read **this document** instead of re-parsing the XLSX. If the source file is updated (new `0805`/later release), re-run the inspection described in [Appendix A](#appendix-a-re-deriving-this-doc) and update this document.

## 1. Metadata

| Property                            | Value                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| File                                | `resources/2026-FFB-Projections-0805-1.xlsx`                   |
| Author / last modifier              | "Jake C" (The Athletic projections are authored by Jake Ciely) |
| Last modified                       | 2026-08-05T19:13:19Z                                           |
| Original path (from workbook props) | `C:\Users\livin\Dropbox\Fantasy Work\NFL 2026\Offseason\`      |
| Creator                             | Jake C                                                         |
| Sheets                              | 48 (41 visible, 7 hidden)                                      |
| Excel Tables                        | 44                                                             |
| Shared strings                      | 727                                                            |

### 1.1 Critical reading note: cached values

Every data cell in the file is the **cached result** of a formula (the workbook stores `calcChain`, `calcPr`), not a literal typed value. A parser such as `@e965/xlsx` / SheetJS returns the cached values, which is what you want — **do not attempt to recompute formulas**; several formulas reference an external workbook (`externalLinks/externalLink1.xml`, pointing at a `[1]Settings` sheet whose link is marked `refreshError="1"`), so recomputation is impossible offline.

Two observable consequences:

- Numeric values carry full double precision (e.g. `371.03529851883343`), and percentages are stored as **decimal fractions** (`0.642` = 64.2%).
- Some cells render as `#N/A` in the raw data (e.g. the tail of "Jake's Ranks" / "Jake PPR" / "Jake Non" WR blocks). Treat them as absent values.

## 2. Global conventions

- **Rank columns** (`RK`, `POS RK`, `OVR RK`) are 1-based integers.
- **Player names** are display names exactly as shown (e.g. `A.J. Brown`, `Ja'Marr Chase`, `De'Von Achane`, `Jaxon Smith-Njigba`, `Erick All`).
- **Team codes** are standard NFL 3-letter codes (`ARI`, `ATL`, …, `WSH`), with two exceptions:
  - Washington is `WSH` on the team sheets, but **`WAS`** on the hidden **Rankings** sheet.
  - The DST sheets use full team names (e.g. `Arizona Cardinals`) plus an `ABBREV` column.
- **BYE** is a numeric week (e.g. `14`, `7`).
- **Position codes**: `QB`, `RB`, `WR`, `TE`, and defenses appear as `DST`/`DSTRef`. Position-rank strings like `QB1`, `WR4`, `TE50` appear in "POS RK" columns.
- **Scoring variants** (three projection families):
  - `FPS` = fantasy points under the file's built-in scoring. **Verifiable baseline: 0 PPR** — on the hidden RB/WR/TE master sheets `FPS < HALF < PPR` with constant deltas of `0.5 × REC` and `1.0 × REC`.
  - `HALF` / `PPR` = 0.5 / 1.0 points-per-reception variants (only on hidden master sheets; RBs/WRs/TEs only).
  - `Custom` = fantasy points recomputed from the **Settings** scoring table plus user-edited team share/percentage inputs. This is the variant used for VORP and auction dollars.
  - **Column-label caveat:** the `FPS` column on the _visible_ ranking sheets (POS Ranks, OVR & VORP per-position blocks, Ranks w Proj, the Jake sheets) actually holds **`Custom`** values, not the 0-PPR `FPS` (e.g. Josh Allen: master `FPS` = 376.61 vs ranking-sheet "FPS" = 371.04). For RBs/WRs/TEs `Custom` coincides with `HALF` (Settings `RECEPTIONS` = 0.5), so "FPS" there = the half-PPR/Custom total. Only the hidden master sheets (§8.3) carry the true 0-PPR `FPS`.
- `AUC$` = auction value in dollars derived from projected points. It is a **relative** value — on PPR sheets it can exceed the auction budget (e.g. TE `Brock Bowers` = `236.5` in "Jake PPR"), so do not assume a hard budget cap.
- `VORP` = value over replacement player; replacement baselines live on "OVR & VORP Ranks" (see §5.2).

## 3. Sheet inventory

Order below = workbook tab order. `[H]` = hidden sheet.

| #    | Sheet                    | Rows × Cols | Role                                                                          |
| ---- | ------------------------ | ----------- | ----------------------------------------------------------------------------- |
| 1    | Instructions             | 14 × 2      | Plain-text usage notes                                                        |
| 2    | Settings                 | 28 × 5      | League scoring + roster configuration (the single source of truth)            |
| 3    | POS Ranks                | 221 × 33    | Top-N ranked lists per position (QB/RB/WR/TE/DST), FPS + auction $            |
| 4    | OVR & VORP Ranks         | 301 × 58    | Per-position ranks with VORP + merged overall lists                           |
| 5    | Ranks w Proj             | 221 × 53    | Athletic ranks with full season stat projections                              |
| 6    | Jake's Ranks             | 221 × 52    | Jake's personal rankings (same layout as Ranks w Proj, minus `AUC Calc`)      |
| 7–38 | ARI…WSH (32 team sheets) | 39 × 39     | Per-team player stat inputs + computed per-player stats                       |
| 39   | DST                      | 33 × 19     | Team defense projections (sacks, INTs, points-allowed buckets)                |
| 40   | Jake PPR                 | 221 × 52    | Jake's PPR ranks with projections                                             |
| 41   | Jake Non                 | 221 × 52    | Jake's non-PPR ranks with projections                                         |
| 42   | Calculated Points `[H]`  | 327 × 42    | Master merged table: every player across positions, custom FPS, position refs |
| 43   | Rankings `[H]`           | 187 × 51    | **Player-name → Player-ID bridge** (for external ADP correlation)             |
| 44   | QB `[H]`                 | 76 × 15     | QB master: projections + FPS/Custom/AUC$                                      |
| 45   | RB `[H]`                 | 161 × 16    | RB master: + HALF/PPR variants                                                |
| 46   | WR `[H]`                 | 203 × 15    | WR master: + HALF/PPR variants                                                |
| 47   | TE `[H]`                 | 97 × 13     | TE master: + HALF/PPR variants                                                |
| 48   | DST1 `[H]`               | 33 × 5      | DST master: custom FPS + AUC$                                                 |

> Note: "Rows × Cols" is the **content extent** (last non-empty row/column). The raw sheet dimension (`!ref`) can be larger because of styled-but-empty cells — e.g. OVR & VORP Ranks = `A1:BG306`, DST = `A1:AA66`, team sheets = `A1:AM64` — but no data exists beyond the ranges above.

Team sheets present (32, tab names): ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WSH.

## 4. Settings & Instructions

### 4.1 Settings (`Settings`, A1:E28)

Two Excel tables: `TableLeagueSettings` (`A1:B28`, Category/Points) and `TableRoster` (`D1:E10`, Category/Value).

**Scoring (Category → Points):**

| Category      | Pts  | Category            | Pts |
| ------------- | ---- | ------------------- | --- |
| PASS ATTEMPTS | 0    | RECEPTIONS (RB)     | 0.5 |
| COMPLETIONS   | 0    | RECEPTIONS (WR)     | 0.5 |
| PASS YARDS    | 0.04 | RECEPTIONS (TE)     | 0.5 |
| PASS TDS      | 4    | RECV YARDS          | 0.1 |
| INTERCEPTIONS | -2   | RECV TDS            | 6   |
| RUSH ATTEMPTS | 0    | DEF SACKS           | 1   |
| RUSH YARDS    | 0.1  | DEF INT             | 2   |
| RUSH TDS      | 6    | DEF FORCE FUMBLE    | 1   |
| TARGETS       | 0    | DEF RECOVER FUMBLE  | 1   |
|               |      | DEF SAFETIES        | 2   |
|               |      | DEF TOUCHDOWN       | 6   |
|               |      | DEF 0 PTS ALLOW     | 7   |
|               |      | DEF 1-6 PTS ALLOW   | 5   |
|               |      | DEF 7-13 PTS ALLOW  | 3   |
|               |      | DEF 14-21 PTS ALLOW | 1   |
|               |      | DEF 22-27 PTS ALLOW | 0   |
|               |      | DEF 28-35 PTS ALLOW | -1  |
|               |      | DEF 35+ PTS ALLOW   | -3  |

**Roster (Category → Value):**

| Category    | Value | Category           | Value |
| ----------- | ----- | ------------------ | ----- |
| TEAMS       | 12    | STARTING TE        | 1     |
| STARTING QB | 1     | STARTING DST       | 1     |
| STARTING RB | 2     | STARTING SUPERFLEX | 0     |
| STARTING WR | 3     | STARTING FLEX      | 1     |
|             |       | AUCTION BUDGET     | 200   |

Note: the default `RECEPTIONS` settings are 0.5, but the built-in `FPS` is 0-PPR; the Settings table drives the `Custom` variant. (See §2.)

### 4.2 Instructions (`Instructions`, 14 rows × 2 cols)

Free text. Key points a consumer should know:

- Only the **yellow** cells are meant to be edited; everything else auto-calculates.
- Stat-total columns `AE–AH` on team sheets should total ≤100%; calculations normalize to 98% when they don't.
- QB attempt totals can't be edited directly; change TEAM PLAYS, TEAM PASS%, or QB PASS SHARE.
- PASS% is editable (RUSH% auto-adjusts to 100). TEAM YPC and TD% affect "available" rushing stats; QB YPA and PASS TD% affect "available" receiving stats.
- Benchmarks: league-average TD% per COMP ≈ 7.1–7.2 (QB); TD% per rush ≈ 3.8 (RB); TGT% ≈ 9.0 (WR); ≈ 5.5 (TE).

## 5. Ranking sheets

### 5.1 POS Ranks (`POS Ranks`, A1:AG221)

Five side-by-side position blocks, each independently ranked, separated by one blank column (`G`, `N`, `U`, `AB`).

| Block | Cols  | Columns (header row 1)                    | Rows of data |
| ----- | ----- | ----------------------------------------- | ------------ |
| QB    | A–F   | RK, Player, TM, BYE, FPS, AUC$            | ~80          |
| RB    | H–M   | RK, Player, TM, BYE, FPS, AUC$            | ~171         |
| WR    | O–T   | RK, Player, TM, BYE, FPS, AUC$            | ~221         |
| TE    | V–AA  | RK, Player, TM, BYE, FPS, AUC$            | ~101         |
| DST   | AC–AG | RK, Player, BYE, FPS, AUC$ (no TM column) | 33           |

Ranks are 1-based and contiguous from the top; block sizes differ by position.

### 5.2 OVR & VORP Ranks (`OVR & VORP Ranks`, A1:BA301)

Six zones:

**Per-position VORP tables** (same shape, one per position):

| Block | Cols | Columns                               |
| ----- | ---- | ------------------------------------- |
| QB    | A–F  | RK, QUARTERBACK, TM, BYE, FPS, VORP   |
| RB    | H–M  | RK, RUNNING BACK, TM, BYE, FPS, VORP  |
| WR    | O–T  | RK, WIDE RECEIVER, TM, BYE, FPS, VORP |
| TE    | V–AA | RK, TIGHT END, TM, BYE, FPS, VORP     |

**VORP baseline parameters** (`AC1:AD8`, Excel table `TableVORPVari`): `AC` = position label (`QB`, `RB`, `WR`, `TE`, `FLEX`, `SFLEX`, `WRTE`), `AD` = "Calc" value. Cached values: QB=2, RB=44, WR=73, TE=30, FLEX=18, SFLEX=0, WRTE=60. The defined names `QBVORPCalc`/`RBVORPCalc`/`WRVORPCalc`/`TEVORPCalc`/`FLEXVORPCalc`/`SFLEXVORPCalc`/`WRTEVORPCalc` point at `$AD$2…$AD$8`.

The per-position VORP columns are computed from the block's `FPS` (which holds `Custom`) minus the baseline value, where **baseline** = the `FPS` of the player at the baseline `RK` **within that position's own VORP table** (matched by `RK`, not by sheet row). Actual formulas (read from the cached formulas):

- **WR / TE / WR+TE**: `FPS − FPS@baseline` (e.g. WR1 = 209.89, TE1 = 115.63, WRTE1 = 158.17).
- **RB**: `(FPS − FPS@baseline) × 0.8` — the delta carries a 0.8 discount factor.
- **QB**: `(FPS − FPS@baseline) + (RB-block VORP on the same row × 0.45)` — the QB block folds in 0.45× the RB block's same-row VORP (e.g. QB1: (371.04 − 335.96) + 0.45 × 176.11 = 114.33).

**Merged lists:**

| Block          | Cols  | Columns                                                                                                                                                                                                                                                        |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall master | AF–AM | POS, RK, OVR RK, OVERALL PLAYER, POS RK, BYE, Custom, VORP — 300 data rows **grouped by position** (QB rows 2–41, RB 42–141, WR 142–251, TE 252–301; 40/100/110/50 players), each group in position-rank order; `OVR RK` (AH) holds each player's overall rank |
| Overall rank   | AO–AT | RK, OVERALL PLAYER, POS RK, BYE, FPS, VORP — 301 rows                                                                                                                                                                                                          |
| WR+TE combined | AV–BA | RK, "WR and TE COMBINED", POS RK, BYE, FPS, VORP — 281 rows; `BC` (single column) holds the `POS` of each row's player                                                                                                                                         |

Rows `BE:BF` (2–5) hold per-position aggregate values (`QB`/`RB`/`WR`/`TE` labels in BE, a scalar in BF).

Note: the "Overall master" block's FPS column is labeled `Custom` (custom-scored points are what feed the overall ranks).

### 5.3 Ranks w Proj (`Ranks w Proj`, A1:BA221)

Four side-by-side blocks (QB, RB, WR, TE), each = Athletic ranking + full season stat projections, with blank separator columns `O`, `AC`, `AP`.

| Block | Cols  | Columns                                                                                                 |
| ----- | ----- | ------------------------------------------------------------------------------------------------------- |
| QB    | A–N   | RK, Player, TM, BYE, PASS ATT, COMP, PASS YARDS, PASS TD, INT, RUSH ATT, RUSH YARDS, RUSH TD, FPS, AUC$ |
| RB    | P–AB  | RK, Player, TM, BYE, RUSH ATT, RUSH YARDS, RUSH TD, TGTS, REC, RECV YARDS, RECV TD, FPS, AUC$           |
| WR    | AD–AO | RK, Player, TM, BYE, RUSH YARDS, RUSH TD, TGTS, REC, RECV YARDS, RECV TD, FPS, AUC$                     |
| TE    | AQ–BA | RK, Player, TM, BYE, TGTS, REC, RECV YARDS, RECV TD, FPS, AUC$, **AUC Calc** (BA)                       |

### 5.4 Jake's Ranks (`Jake's Ranks`, A1:AZ221)

Identical four-block layout to §5.3 except: (a) `AUC Calc` is absent (TE block ends at `AZ` instead of `BA`), (b) the block columns are otherwise unchanged — `RK` at `P`/`AD`/`AQ`, same as §5.3 — and (c) the ranking **order and player set differ** from "Ranks w Proj" (e.g. RB1 = Bijan Robinson; QB list leads Josh Allen, Drake Maye, Lamar Jackson, Jayden Daniels, Joe Burrow, Jalen Hurts, Dak Prescott). Trailing WR-block rows contain `#N/A` cached values — ignore them. The FPS columns hold the same half-PPR/`Custom` totals described in §5.5.

### 5.5 Jake PPR / Jake Non (`Jake PPR`, `Jake Non`, A1:AZ221)

Same layout and headers as §5.4. The three "Jake" sheets (`Jake's Ranks`, `Jake PPR`, `Jake Non`) share the same per-player projection values; they differ in **rank order** and in the **`AUC$` columns**:

- **FPS columns are half-PPR/`Custom` totals, not the standard `FPS`.** Verified against the hidden master sheets: TE-block `AY`, WR-block `AN`, and RB-block `AA` all equal the master-sheet `HALF`/`Custom` value (e.g. TE `Brock Bowers` `AY = 189.2` = master `HALF`; RB `Derrick Henry` `AA = 240.8` = master `HALF`; WR `Puka Nacua` `AN = 288.9` = master `HALF`). The `FPS` column label is therefore misleading here.
- **Rank order shifts between PPR and Non** for the RB/WR/TE blocks (the QB block is identical in all three sheets). Example swaps: TE `Tucker Kraft`/`Tyler Warren` (ranks 4–5), RB `Chase Brown`/`Derrick Henry` (rank 6). Player sets can also differ slightly at the tail (e.g. `Bryce Lance` vs `Xavier Hutchinson` in the WR block).
- **`AUC$` differs by sheet/scoring:**
  - `Jake PPR` — PPR-scored auction value (TE `Bowers` = `236.5`, which equals the master `PPR` value; values exceed the 200 budget).
  - `Jake Non` — non-PPR/standard-scoring auction value (TE `Bowers` = `141.96`, which equals the master `FPS` value).
  - `Jake's Ranks` — the same standard `AUC$` as "Ranks w Proj" (TE `Bowers` = `25.19`).
  - RB-block `AUC$` (`AB`) is **identical row-for-row between `Jake PPR` and `Jake Non` even where the players differ**, i.e. for RBs the dollar value is attached to the rank slot rather than the player in these sheets.
- Both `Jake PPR` and `Jake Non` contain trailing `#N/A` cached cells in the WR/TE blocks.

## 6. Team sheets (32, e.g. `ARI`)

All 32 team sheets share the identical schema: `A1:AM39`, header at row 1.

### 6.1 Row 1 header (QB-oriented labels)

| Col | Label      | Col | Label        | Col    | Label                                                 |
| --- | ---------- | --- | ------------ | ------ | ----------------------------------------------------- |
| A   | PLAYER     | L   | TARGETS      | X      | TD PER CAR%                                           |
| B   | POS        | M   | REC          | Y      | RECP%                                                 |
| C   | BYE        | N   | RECV YARDS   | Z      | YD PER RECP                                           |
| D   | PASS ATT   | O   | RECV TD      | AA     | TGT SHARE                                             |
| E   | COMP       | Q   | PASS SHARE   | AB     | TD SHARE                                              |
| F   | PASS YARDS | R   | COMP%        | AD     | EDIT PASS SHARE                                       |
| G   | PASS TD    | S   | YDS PER COMP | AE     | EDIT RUSH SHARE                                       |
| H   | INT        | T   | TD%          | AF     | EDIT TGT SHARE                                        |
| I   | RUSH ATT   | U   | INT%         | AG     | EDIT TD PER REC                                       |
| J   | RUSH YARDS | V   | YD PER CARRY | AH, AI | _(no header; normalized mirrors of AE/AF — see §6.3)_ |
| K   | RUSH TD    | W   | RUSH SHARE   | AM     | team code (e.g. `ARI`)                                |

Blank columns: `P`, `AC`, `AJ`, `AK`, `AL`. The `AH`/`AI` columns are unlabeled but populated as normalized mirrors of the edit-share columns `AE`/`AF` (see §6.3); headers exist only through `AG`.

### 6.2 Row layout

| Rows  | Content                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| 1     | Header                                                                                                     |
| 2–4   | QBs (one row per QB; teams with fewer than 3 QBs pad with an all-zero row, `B="QB"`)                       |
| 5     | blank                                                                                                      |
| 6–11  | RBs: real players, then 0–3 all-zero placeholder rows (`B="RB"`)                                           |
| 12    | blank                                                                                                      |
| 13–20 | WRs: real players, then 0–3 all-zero placeholder rows (`B="WR"`)                                           |
| 21    | blank                                                                                                      |
| 22–25 | TEs: real players, then 0–2 all-zero placeholder rows (`B="TE"`)                                           |
| 26    | blank                                                                                                      |
| 27    | `TOT SHR` label row                                                                                        |
| 28–29 | TEAM NUMBERS block (row 28 = `PLAYS`/`PASS%`/`RUSH%`/`RU YPC` labels + `TOT SHR` values; row 29 = values)  |
| 31–32 | TEAM NUMBERS — TM PASS (COMP, YDS, TD)                                                                     |
| 34–35 | TEAM NUMBERS — TM RUSH (YDS, TD)                                                                           |
| 37–39 | TEAM TOTAL DIFFERENCES (TM RSH ATT, TM RUSH YD, TM RUSH TD, TM TGT, TM REC, TM REC YD, TM REC TD) + totals |

Block sizes vary by team (e.g. ARI: 3 QBs, 4 RBs + 2 placeholders, 6 WRs + 2 placeholders, 3 TEs + 1 placeholder). The `TOT SHR` values on row 28 are the normalized (≈0.98) share totals — see §4.2.

### 6.3 Columns are populated per position (not reused)

Columns keep the fixed header meanings from §6.1; each position fills the columns relevant to it and leaves the rest empty (WRs zero out the rush columns). Confirmed populated cells:

| Column | QB rows                                    | RB rows         | WR rows                          | TE rows         |
| ------ | ------------------------------------------ | --------------- | -------------------------------- | --------------- |
| D–H    | PASS ATT, COMP, PASS YARDS, PASS TD, INT   | —               | —                                | —               |
| I      | RUSH ATT                                   | RUSH ATT        | 0                                | —               |
| J      | RUSH YARDS                                 | RUSH YARDS      | 0                                | —               |
| K      | RUSH TD                                    | RUSH TD         | 0                                | —               |
| L      | —                                          | TARGETS         | TARGETS                          | TARGETS         |
| M      | —                                          | REC             | REC                              | REC             |
| N      | —                                          | RECV YARDS      | RECV YARDS                       | RECV YARDS      |
| O      | —                                          | RECV TD         | RECV TD                          | RECV TD         |
| Q–U    | PASS SHARE, COMP%, YDS PER COMP, TD%, INT% | —               | —                                | —               |
| V      | YD PER CARRY                               | YD PER CARRY    | ~3 (constant; semantics unclear) | —               |
| W      | RUSH SHARE                                 | RUSH SHARE      | 0                                | —               |
| X      | TD PER CAR%                                | TD PER CAR%     | ~0.007                           | —               |
| Y      | —                                          | RECP%           | RECP%                            | RECP%           |
| Z      | —                                          | YD PER RECP     | YD PER RECP                      | YD PER RECP     |
| AA     | —                                          | TGT SHARE       | TGT SHARE                        | TGT SHARE       |
| AB     | —                                          | TD SHARE        | TD SHARE                         | TD SHARE        |
| AD     | EDIT PASS SHARE                            | —               | —                                | —               |
| AE     | EDIT RUSH SHARE                            | EDIT RUSH SHARE | 0                                | —               |
| AF     | —                                          | EDIT TGT SHARE  | EDIT TGT SHARE                   | EDIT TGT SHARE  |
| AG     | —                                          | EDIT TD PER REC | EDIT TD PER REC                  | EDIT TD PER REC |
| AH     | mirror of AE                               | mirror of AE    | 0                                | —               |
| AI     | —                                          | mirror of AF    | mirror of AF                     | mirror of AF    |

`—` = cell empty for that position. `AH`/`AI` are unlabeled normalized mirrors of the edit-share columns. Verified across all 32 team sheets (e.g. QB `D` = PASS ATT and `R` = COMP% (0.642 for ARI's QB1); RB `I` = RUSH ATT, `V` = YD PER CARRY, `AE` = EDIT RUSH SHARE, `AH` mirrors `AE`; WR `V` ≈ 3, `X` ≈ 0.007, `AE` = 0; TE `L` = TARGETS, `Y` = RECP%, `AF` = EDIT TGT SHARE, `AI` mirrors `AF`).

### 6.4 Player stat columns

For RB/WR rows the stat block is `I–O` (rush att/yds/td at `I`/`J`/`K`, targets at `L`, rec at `M`, recv yds/td at `N`/`O`) and the rate/share block is `V–AB`; for TE rows the stat block is `L–O` and the rate/share block is `Y–AB`. The edit columns `AD`–`AG` (plus the `AH`/`AI` mirrors) are the editable share inputs (the "yellow" cells per Instructions). The row-39 tail holds team-level totals used by the model.

## 7. DST sheet (`DST`, A1:S33)

| Col | Header                    | Notes                                                                                                                                                                                                                                                         |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Ref                       | `DST1`…`DST32`                                                                                                                                                                                                                                                |
| B   | TEAM                      | full name (e.g. `Arizona Cardinals`)                                                                                                                                                                                                                          |
| C   | ABBREV                    | 3-letter code                                                                                                                                                                                                                                                 |
| D   | BYE                       | week                                                                                                                                                                                                                                                          |
| E   | SACKS                     | season total                                                                                                                                                                                                                                                  |
| F   | INT                       | season total                                                                                                                                                                                                                                                  |
| G   | FORCED FUMBLE             | season total                                                                                                                                                                                                                                                  |
| H   | RECOV'D FUMBLE            | season total                                                                                                                                                                                                                                                  |
| I   | SAFETIES                  | **empty in all rows**                                                                                                                                                                                                                                         |
| J   | DEF TD                    | season total (e.g. `2.15`)                                                                                                                                                                                                                                    |
| K   | PTS PER GAME              | points allowed/game                                                                                                                                                                                                                                           |
| L–R | 0 PT GAMES … 35+ PT GAMES | **empty in all rows** (headers only; points-allowed game distribution is not populated). Exact headers: `0`, `1-6`, `7-13`, `14-21`, `22-26`, `27-34`, `35+` — note the `22-26`/`27-34` boundaries differ from the Settings scoring buckets (`22-27`/`28-35`) |
| S   | YD PER GAME               | yards allowed/game (e.g. `366.6`)                                                                                                                                                                                                                             |

## 8. Hidden sheets

### 8.1 Calculated Points (`Calculated Points`, A1:AP327)

`B1 = "DO NOT EDIT THIS SHEET"`; header row is **row 2**. One long table that unifies every position (Excel tables: `TableQBCalcPts` A2:F102, `TableRBCalcPts` H2:M177, `TableWRCalcPts` O2:T227, `TableTECalcPts` V2:AA102, `TableDSTCalcPts` AC2:AG34, `TableWRTECalcPts` AI2:AP327).

| Block                | Cols  | Columns                                          |
| -------------------- | ----- | ------------------------------------------------ |
| QB                   | A–F   | RK, QBRef, PLAYER, TM, BYE, Custom               |
| RB                   | H–M   | RK, RBRef, PLAYER, TM, BYE, Custom               |
| WR                   | O–T   | RK, WRRef, PLAYER, TM, BYE, Custom               |
| TE                   | V–AA  | RK, TERef, PLAYER, TM, BYE, Custom               |
| DST                  | AC–AG | RK, DSTRef, PLAYER, BYE, Custom                  |
| All (WR+TE combined) | AI–AP | POS, RK, POSRef, PLAYER, POS RK, TM, BYE, Custom |

`*Ref` columns are the 1-based index into the corresponding master sheet (§8.3). `Custom` = custom-scored fantasy points. The blocks are **not** sorted by points: each block lists players in master-sheet order (team by team); the `RK` column of each block holds the player's overall rank within the sheet's merged 327-player table. The `AI–AP` block is a per-team listing of every WR and TE (325 data rows, rows 3–327; `POS` alternates `WR`/`TE`), with `AJ` holding the player's combined WR+TE rank. The tail rows (the last ~55, after the final named player) are **partial, not `#N/A`**: `POS`/`POSRef`/`POS RK` are populated but `PLAYER`, `TM`, `BYE`, and `AP` (`Custom`) are empty.

### 8.2 Rankings (`Rankings`, A1:AY187) — the player-ID bridge

Two header rows:

- Row 1 (block labels): `A=RK`, then `C=QB`, `H=RB`, `M=WR`, `R=TE`, `W=RB`, `AB=WR`, `AG=TE`, `AL=RB`, `AQ=WR`, `AV=TE`.
- Row 2 (sub-headers): every block has `Name`, `Team`, `Position`, `Player ID`.

So there are **10 position blocks**, each `Name/Team/Position/Player ID`:
QB (C–F), RB (H–K), WR (M–P), TE (R–U), then **RB/WR/TE repeated twice** (W–Z / AB–AE / AG–AJ and AL–AO / AQ–AT / AV–AY). The repeated blocks contain the _same_ players as the first set (they serve as flex-context lists).

Data runs rows 3–187 (`RK` 1–185 in column A). `Player ID` is an opaque 5-digit numeric ID per player (e.g. `Josh Allen = 17298`, `Bijan Robinson = 23133`, `Puka Nacua = 23180`, `Brock Bowers = 22955`).

**Purpose:** this sheet is the stable key between the projection file and external ADP data — correlate players by `Name`/`Team`/`Position` (or by `Player ID` if the ADP source shares IDs) to attach ADP to projected points. Team codes here use `WAS` for Washington.

### 8.3 Position master sheets (`QB`, `RB`, `WR`, `TE`, `DST1`)

Single per-position tables, one row per player, 1-based `*Ref` column. These are the canonical per-player projection records (and the `*Ref` indices referenced by Calculated Points).

**QB** (`A1:O76`, `TableQBMaster`):

| Col    | A     | B      | C   | D   | E    | F   | G    | H    | I   | J    | K    | L    | M   | N      | O    |
| ------ | ----- | ------ | --- | --- | ---- | --- | ---- | ---- | --- | ---- | ---- | ---- | --- | ------ | ---- |
| Header | QBRef | Player | TM  | BYE | PATT | CMP | PAYD | PATD | INT | RUAT | RUYD | RUTD | FPS | Custom | AUC$ |

**RB** (`A1:P161`, `TableRBMaster`): `RBRef, Player, TM, BYE, RUAT, RUYD, RUTD, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`

**WR** (`A1:O203`, `TableWRMaster`): `WRRef, Player, TM, BYE, RUYD, RUTD, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$` (rush columns exist but are 0 for WRs)

**TE** (`A1:M97`, `TableTEMaster`): `TERef, Player, TM, BYE, TGT, REC, RCYD, RCTD, FPS, HALF, PPR, Custom, AUC$`

**DST1** (`A1:E33`, `TableDSTMaster`): `DSTRef, Player, BYE, Custom, AUC$`

Placeholder rows (e.g. row with `B="0"`) exist at the end of each block and can be skipped.

## 9. Excel Tables inventory (44)

| Table # | Name                 | Ref       | Sheet             |
| ------- | -------------------- | --------- | ----------------- |
| 1       | TableLeagueSettings  | A1:B28    | Settings          |
| 2       | TableRoster          | D1:E10    | Settings          |
| 3       | TableQBRanks         | A1:F80    | POS Ranks         |
| 4       | TableRBRanks         | H1:M171   | POS Ranks         |
| 5       | TableWRRanks         | O1:T221   | POS Ranks         |
| 6       | TableTERanks         | V1:AA101  | POS Ranks         |
| 7       | TableDSTRanks        | AC1:AG33  | POS Ranks         |
| 8       | TableQBVORP          | A1:F101   | OVR & VORP Ranks  |
| 9       | TableVORPVari        | AC1:AD8   | OVR & VORP Ranks  |
| 10      | TableRBVORP          | H1:M176   | OVR & VORP Ranks  |
| 11      | TableWRVORP          | O1:T226   | OVR & VORP Ranks  |
| 12      | TableTEVORP          | V1:AA101  | OVR & VORP Ranks  |
| 13      | TableOverallMaster   | AF1:AM301 | OVR & VORP Ranks  |
| 14      | TableOverallRank     | AO1:AT301 | OVR & VORP Ranks  |
| 15      | TableWRTERank        | AV1:BA281 | OVR & VORP Ranks  |
| 16      | TableWRTEMaster      | BC1:BC281 | OVR & VORP Ranks  |
| 17      | TableQBRanks30       | A1:N80    | Ranks w Proj      |
| 18      | TableRBRanks31       | P1:AB171  | Ranks w Proj      |
| 19      | TableWRRanks32       | AD1:AO221 | Ranks w Proj      |
| 20      | TableTERanks33       | AQ1:BA101 | Ranks w Proj      |
| 21      | TableQBRanks3040     | A1:N80    | Jake's Ranks      |
| 22      | TableRBRanks3141     | P1:AB171  | Jake's Ranks      |
| 23      | TableWRRanks3242     | AD1:AO221 | Jake's Ranks      |
| 24      | TableTERanks3343     | AQ1:AZ101 | Jake's Ranks      |
| 25      | TableDSTOverall      | A1:S33    | DST               |
| 26      | TableQBRanks304034   | A1:N80    | Jake PPR          |
| 27      | TableRBRanks314135   | P1:AB171  | Jake PPR          |
| 28      | TableWRRanks324236   | AD1:AO221 | Jake PPR          |
| 29      | TableTERanks334337   | AQ1:AZ101 | Jake PPR          |
| 30      | TableQBRanks30403438 | A1:N80    | Jake Non          |
| 31      | TableRBRanks31413539 | P1:AB171  | Jake Non          |
| 32      | TableWRRanks32423644 | AD1:AO221 | Jake Non          |
| 33      | TableTERanks33433745 | AQ1:AZ101 | Jake Non          |
| 34      | TableQBCalcPts       | A2:F102   | Calculated Points |
| 35      | TableRBCalcPts       | H2:M177   | Calculated Points |
| 36      | TableWRCalcPts       | O2:T227   | Calculated Points |
| 37      | TableTECalcPts       | V2:AA102  | Calculated Points |
| 38      | TableDSTCalcPts      | AC2:AG34  | Calculated Points |
| 39      | TableWRTECalcPts     | AI2:AP327 | Calculated Points |
| 40      | TableQBMaster        | A1:O76    | QB                |
| 41      | TableRBMaster        | A1:P161   | RB                |
| 42      | TableWRMaster        | A1:O203   | WR                |
| 43      | TableTEMaster        | A1:M97    | TE                |
| 44      | TableDSTMaster       | A1:E33    | DST1              |

## 10. Defined names (scoring constants)

The workbook defines names that map directly to `Settings` cells (used by formulas throughout). Relevant ones:

- `PASS_ATTEMPTS`→`Settings!$B$2`, `COMPLETIONS`→`$B$3`, `PASS_YARDS`→`$B$4`, `PASS_TDS`→`$B$5`, `INTERCEPTIONS`→`$B$6`
- `RUSH_ATTEMPTS`→`$B$7`, `RUSH_YARDS`→`$B$8`, `RUSH_TDS`→`$B$9`, `TARGETS`→`$B$10`, `RECEPTIONS_RB`→`$B$11`, `RECEPTIONS_WR`→`$B$12`, `RECEPTIONS_TE`→`$B$13`, `RECV_YARDS`→`$B$14`, `RECV_TDS`→`$B$15`
- `DEF_SACKS`→`$B$16`, `DEF_INT`→`$B$17`, `DEF_FORCE_FUMBLE`→`$B$18`, `DEF_RECOVER_FUMBLE`→`$B$19`, `DEF_SAFETIES`→`$B$20`, `DEF_TOUCHDOWN`→`$B$21`, `DEF_0_PTS_ALLOW`→`$B$22` … `DEF_35__PTS_ALLOW`→`$B$28`
- `TEAMS`→`$E$2`, `STARTING_QB`→`$E$3`, `STARTING_RB`→`$E$4`, `STARTING_WR`→`$E$5`, `STARTING_TE`→`$E$6`, `STARTING_DST`→`$E$7`, `STARTING_SUPERFLEX`→`$E$8`, `STARTING_FLEX`→`$E$9`
- VORP baselines: `QBVORPCalc`→`'OVR & VORP Ranks'!$AD$2`, `RBVORPCalc`→`$AD$3`, `WRVORPCalc`→`$AD$4`, `TEVORPCalc`→`$AD$5`, `FLEXVORPCalc`→`$AD$6`, `SFLEXVORPCalc`→`$AD$7`, `WRTEVORPCalc`→`$AD$8`

Note: `COMPLETIONS`, `PASS_ATTEMPTS`, etc. also exist as **local** names (`localSheetId=3` = OVR & VORP Ranks, `localSheetId=41` = Jake Non) pointing at the external `[1]Settings` workbook; that's the source of the workbook's broken external link (§1.1). Consumers should read the Settings sheet directly instead.

## 11. Cross-sheet data flow (how the pieces connect)

```
Team sheets (ARI…WSH)  ──►  QB/RB/WR/TE master sheets (§8.3, per-player stats)
        │                        │  (1-based *Ref indices)
        │                        ▼
        │                 Calculated Points (§8.1, merged, Custom FPS)
        │                        │
        │                        ├──► POS Ranks (§5.1, per-position top lists)
        │                        ├──► OVR & VORP Ranks (§5.2, VORP + overall lists)
        │                        └──► Ranks w Proj (§5.3) / Jake's Ranks (§5.4)
        │                                                    │
        │                              Jake PPR / Jake Non (§5.5, PPR & non-PPR AUCTION)
DST sheet (§7) ──► DST1 master (§8.3) ──► Calculated Points DST block

Rankings sheet (§8.2)  =  player Name/Team/Position → Player ID  (for external ADP)
```

Everything derives from the team sheets + Settings; the ranking/master sheets are precomputed views. For the Draft Day app, the practical reading order is:

1. **Settings** for scoring/roster defaults.
2. **Rankings** (or the team sheets) for the canonical player list (name, team, position) and `Player ID` for ADP correlation.
3. **Calculated Points** (or the position master sheets) for per-player stat projections, `FPS`, `Custom`, `HALF`/`PPR`, and `AUC$`.
4. **OVR & VORP Ranks** for VORP and overall/position ranks.

## 12. Practical parsing guidance

- Parse with `@e965/xlsx` (SheetJS) in `cellDates:false` mode and read cached values. Skip empty rows and rows whose `Player`/`PLAYER` cell is empty or `0`.
- For a unified player table, the **Calculated Points** `AI:AP` block (POS, RK, POSRef, PLAYER, POS RK, TM, BYE, Custom) plus the **Rankings** block (`Name/Team/Position/Player ID`) is the highest-signal data: every player once, with position, rank, custom FPS, and a stable ID.
- Watch the team-code discrepancy: team sheets use `WSH`; the Rankings sheet uses `WAS`.
- Percentages are decimal fractions; BYE weeks are integers; `AUC$` may exceed the auction budget on PPR sheets.
- Expect `#N/A` cached cells in the tail rows of Jake PPR / Jake Non WR blocks — filter them out. (Calculated Points has **no** `#N/A`; its tail rows are partial/empty instead — see §8.1.)

## Appendix A: Re-deriving this doc

If the source file changes, re-inspect it rather than trusting stale docs:

1. Unzip the XLSX (`unzip`), then read `xl/workbook.xml` (sheet names/order/hidden state), `xl/_rels/workbook.xml.rels` (rId → sheet file), and each sheet's `_rels/*.xml.rels` for its Excel-table mapping.
2. Resolve `xl/sharedStrings.xml` for string cells (`t="s"` → index into `<si>` text; rich text concatenates `<r><t>` runs).
3. Parse each `xl/worksheets/sheetN.xml`: `<row r="…">` → `<c r="A1" t="s"><v>idx</v></c>`. **Careful:** a styled-but-empty cell is serialized as a self-closing `<c r="X1" s="N"/>`; a naive `/<c.*?<\/c>/` regex will glue it to the following non-empty cell and shift values one column left. Handle self-closing cells explicitly (see the corrected parser pattern in the session history).
4. Reproduce the per-sheet tables in §§4–8 and the table inventory in §9.

## Appendix B: Known quirks / errata

- DST `SAFETIES` and the points-allowed game-distribution columns (`0 PT GAMES`…`35+ PT GAMES`) are **empty** despite headers; only sacks/INTs/FF/FR/DEF TD/PTS PER GAME/YD PER GAME are populated.
- Edit-share columns keep their labels: `AD` = EDIT PASS SHARE (QBs only), `AE` = EDIT RUSH SHARE (QBs/RBs), `AF` = EDIT TGT SHARE (RBs/WRs/TEs), `AG` = EDIT TD PER REC (RBs/WRs/TEs); `AH`/`AI` are unlabeled normalized mirrors of `AE`/`AF` (§6.3).
- FPS is 0-PPR by construction (verified via HALF/PPR deltas); the Settings `RECEPTIONS` values feed `Custom`, not `FPS`.
- Team sheet WR rows put a constant (usually `3`, sometimes larger) in column V (header says YD PER CARRY); meaning is not documented in the workbook — do not infer it.
- The workbook's external link (`[1]Settings`) is broken (`refreshError=1`); it affects local defined names on OVR & VORP Ranks and Jake Non only, and cached cell values remain readable.
