import { z } from 'zod';

export const envSchema = z.object({
  VITE_ESPN_LEAGUE: z.coerce.number().int().positive().optional(),
  VITE_ESPN_S2: z.string().optional(),
  VITE_SWID: z.string().optional(),
});

export default function getEnv() {
  return envSchema.parse(Deno.env.toObject());
}
