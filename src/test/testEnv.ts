import { z } from "zod";

export const envSchema = z.object({
  VITE_ESPN_LEAGUE: z.coerce.number().int().positive().optional(),
  VITE_ESPN_S2: z.string().optional(),
  VITE_SWID: z.string().optional(),
});

let env: undefined | z.infer<typeof envSchema>;

export default function getEnv() {
  return (env ??= envSchema.parse(Deno.env.toObject()));
}
