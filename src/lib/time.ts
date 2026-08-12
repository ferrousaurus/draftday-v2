/**
 * Midnight-UTC expiry helper (§5.2, §7). Pure; `msUntilNextUtcMidnight` is the
 * Temporal-typed form used server-side and in tests; `msUntilNextUtcMidnightMs`
 * is the plain-epoch form used where Temporal is unavailable (client bundles).
 */

export function msUntilNextUtcMidnightMs(epochMs: number): number {
  const now = new Date(epochMs);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(next - epochMs, 1);
}

export function msUntilNextUtcMidnight(now: Temporal.Instant = Temporal.Now.instant()): number {
  return msUntilNextUtcMidnightMs(now.epochMilliseconds);
}
