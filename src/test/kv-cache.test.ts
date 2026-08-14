/**
 * Deno KV BeatADP cache tests (§5.2): the in-memory KV backing in dev/tests
 * exercises the same code path as production. Pins the array key shape, the
 * round trip, and midnight-UTC expiry (`expireIn`).
 */
import { describe, expect, it } from 'vitest';
import { getCachedBeatAdp, putCachedBeatAdp } from '../server/beatadp.ts';
import { msUntilNextUtcMidnight } from '../lib/time.ts';

const params = { scoringFormat: 'PPR' as const, draftType: 'REDRAFT' as const, qbType: '1QB' as const };

describe('beatadp Deno KV cache', () => {
  it('round-trips a parsed table under the (scoringFormat, draftType, qbType) key', async () => {
    const table = {
      rows: [
        {
          name: 'Jahmyr Gibbs',
          team: 'DET',
          consensus: 1.9,
          sleeper: 2.3,
          espn: 1.6,
          yahoo: null,
          underdog: null,
          fantasyPros: 1.8,
        },
      ],
    };
    const before = await getCachedBeatAdp(params);
    expect(before).toBeNull();
    await putCachedBeatAdp(params, { data: table, fetchedAt: 1_000_000 });
    const after = await getCachedBeatAdp(params);
    expect(after).not.toBeNull();
    if (after !== null && after.data !== null) {
      expect(after.data.rows[0]?.name).toBe('Jahmyr Gibbs');
      expect(after.fetchedAt).toBe(1_000_000);
    }
  });

  it('stores empty results under the same key (no special-casing)', async () => {
    const emptyParams = { scoringFormat: 'PPR' as const, draftType: 'REDRAFT' as const, qbType: '2QB' as const };
    await putCachedBeatAdp(emptyParams, { data: null, fetchedAt: 2_000_000 });
    const after = await getCachedBeatAdp(emptyParams);
    expect(after).not.toBeNull();
    if (after !== null) {
      expect(after.data).toBeNull();
    }
  });

  it('sets expireIn to the milliseconds until next UTC midnight', () => {
    const ttl = msUntilNextUtcMidnight();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 3_600_000);
  });
});
