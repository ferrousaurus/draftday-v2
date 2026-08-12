import { z } from 'zod';

/**
 * League-aware ESPN live-probe credentials (§10.2). The spec names the
 * `VITEST_ESPN_*` variables; the dev environment supplies `VITE_ESPN_*`
 * (AGENTS.md), so both names are accepted with `VITEST_` taking precedence.
 */
export const envSchema = z
  .object({
    VITEST_ESPN_S2: z.string().optional(),
    VITEST_SWID: z.string().optional(),
    VITEST_ESPN_LEAGUE: z.coerce.number().int().positive().optional(),
    VITE_ESPN_S2: z.string().optional(),
    VITE_SWID: z.string().optional(),
    VITE_ESPN_LEAGUE: z.coerce.number().int().positive().optional(),
  })
  .transform((env) => ({
    espnS2: env.VITEST_ESPN_S2 ?? env.VITE_ESPN_S2 ?? '',
    swid: env.VITEST_SWID ?? env.VITE_SWID ?? '',
    leagueId: env.VITEST_ESPN_LEAGUE ?? env.VITE_ESPN_LEAGUE ?? null,
  }));

export type TestEnv = { espnS2: string; swid: string; leagueId: number | null };

export function getTestEnv(): TestEnv {
  const parsed = envSchema.parse(Deno.env.toObject());
  return { espnS2: parsed.espnS2, swid: parsed.swid, leagueId: parsed.leagueId };
}
