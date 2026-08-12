import { describe, expect, it } from 'vitest';

import { envSchema } from './test-env.ts';

describe('envSchema', () => {
  it('accepts the VITEST_* variables and coerces the league id to a number', () => {
    const parsed = envSchema.parse({
      VITEST_ESPN_LEAGUE: '1234567',
      VITEST_ESPN_S2: 'abc',
      VITEST_SWID: 'def',
    });
    expect(parsed).toEqual({ espnS2: 'abc', swid: 'def', leagueId: 1_234_567 });
  });

  it('prefers VITEST_* over the legacy VITE_* names', () => {
    const parsed = envSchema.parse({
      VITEST_ESPN_LEAGUE: '111',
      VITEST_ESPN_S2: 'new',
      VITEST_SWID: 'newer',
      VITE_ESPN_LEAGUE: '222',
      VITE_ESPN_S2: 'old',
      VITE_SWID: 'older',
    });
    expect(parsed).toEqual({ espnS2: 'new', swid: 'newer', leagueId: 111 });
  });

  it('falls back to the VITE_* names when VITEST_* are absent', () => {
    const parsed = envSchema.parse({
      VITE_ESPN_LEAGUE: '222',
      VITE_ESPN_S2: 'old',
      VITE_SWID: 'older',
    });
    expect(parsed).toEqual({ espnS2: 'old', swid: 'older', leagueId: 222 });
  });

  it('allows absent variables', () => {
    expect(envSchema.parse({})).toEqual({ espnS2: '', swid: '', leagueId: null });
  });

  it('rejects a non-numeric league id', () => {
    expect(() => envSchema.parse({ VITEST_ESPN_LEAGUE: 'abc' })).toThrow();
  });

  it('rejects a non-integer league id', () => {
    expect(() => envSchema.parse({ VITEST_ESPN_LEAGUE: '12.5' })).toThrow();
  });
});
