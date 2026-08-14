/**
 * Settings-model tests (§3.2): PPR chip derivation, qbType/scoringFormat
 * derivation, per-platform draft types, and validation bounds.
 */
import {
  DEFAULT_SETTINGS,
  DRAFT_TYPES_BY_PLATFORM,
  deriveQbType,
  deriveScoringFormat,
  pprPreset,
  receptionsFromPpr,
  settingsSchema,
} from '../lib/settings.ts';
import { adpModeFor, draftTypeOptions, platformHasLeagueAware } from '../lib/adp.ts';
import { describe, expect, it } from 'vitest';

describe('PPR chip rule (§3.2)', () => {
  it('derives the preset from the canonical RECEPTIONS triple', () => {
    expect(pprPreset({ rb: 0.5, wr: 0.5, te: 0.5 })).toBe(0.5);
    expect(pprPreset({ rb: 0, wr: 0, te: 0 })).toBe(0);
    expect(pprPreset({ rb: 1, wr: 1, te: 1 })).toBe(1);
  });

  it('shows Custom when the values diverge or take a non-preset value', () => {
    expect(pprPreset({ rb: 0.5, wr: 1, te: 0.5 })).toBe('custom');
    expect(pprPreset({ rb: 0.75, wr: 0.75, te: 0.75 })).toBe('custom');
  });

  it('selecting a preset writes all three RECEPTIONS fields at once', () => {
    expect(receptionsFromPpr(1)).toEqual({ rb: 1, wr: 1, te: 1 });
    expect(receptionsFromPpr(0)).toEqual({ rb: 0, wr: 0, te: 0 });
  });
});

describe('derived qbType / scoringFormat (§3.2)', () => {
  it('derives qbType from STARTING QB + SUPERFLEX (never stored)', () => {
    expect(deriveQbType({ startingQb: 1, superflex: 0 })).toBe('1QB');
    expect(deriveQbType({ startingQb: 1, superflex: 1 })).toBe('2QB');
    expect(deriveQbType({ startingQb: 2, superflex: 0 })).toBe('2QB');
  });

  it('maps PPR 0/0.5/1 to STANDARD/HALF_PPR/PPR and Custom → PPR', () => {
    expect(deriveScoringFormat({ rb: 0, wr: 0, te: 0 })).toBe('STANDARD');
    expect(deriveScoringFormat({ rb: 0.5, wr: 0.5, te: 0.5 })).toBe('HALF_PPR');
    expect(deriveScoringFormat({ rb: 1, wr: 1, te: 1 })).toBe('PPR');
    expect(deriveScoringFormat({ rb: 0.75, wr: 0.75, te: 0.75 })).toBe('PPR');
  });

  it('a league-aware PPR change alters the BeatADP URL (provider key)', () => {
    const half = adpModeFor({ ...DEFAULT_SETTINGS, platform: 'Yahoo' });
    const full = adpModeFor({
      ...DEFAULT_SETTINGS,
      platform: 'Yahoo',
      scoring: { ...DEFAULT_SETTINGS.scoring, receptionsRb: 1, receptionsWr: 1, receptionsTe: 1 },
    });
    expect(half.kind).toBe('beatadp');
    expect(full.kind).toBe('beatadp');
    if (half.kind === 'beatadp' && full.kind === 'beatadp') {
      expect(half.scoringFormat).not.toBe(full.scoringFormat);
    }
  });
});

describe('platform draft types (§3.2)', () => {
  it('exposes per-platform options with ESPN redraft-only', () => {
    expect(DRAFT_TYPES_BY_PLATFORM.ESPN).toEqual(['REDRAFT']);
    expect(DRAFT_TYPES_BY_PLATFORM.Yahoo).toEqual(['REDRAFT', 'BEST_BALL']);
    expect(DRAFT_TYPES_BY_PLATFORM.Sleeper).toEqual(['REDRAFT', 'BEST_BALL', 'DYNASTY']);
    expect(draftTypeOptions('ESPN')).toEqual(['REDRAFT']);
  });

  it('league-aware is available for ESPN/Sleeper only', () => {
    expect(platformHasLeagueAware('ESPN')).toBe(true);
    expect(platformHasLeagueAware('Sleeper')).toBe(true);
    expect(platformHasLeagueAware('Yahoo')).toBe(false);
  });
});

describe('validation bounds (§3.2) — validation-only, never UI-blocking', () => {
  it('accepts defaults', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('rejects out-of-bounds values', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, leagueSize: 99 }).success).toBe(false);
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, scoring: { ...DEFAULT_SETTINGS.scoring, receptionsRb: 5 } })
        .success,
    ).toBe(false);
  });

  it('stores negative rates signed', () => {
    const parsed = settingsSchema.parse({
      ...DEFAULT_SETTINGS,
      scoring: { ...DEFAULT_SETTINGS.scoring, interceptions: -3 },
    });
    expect(parsed.scoring.interceptions).toBe(-3);
  });
});
