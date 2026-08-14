/**
 * Deno KV handle (§5.2): opened lazily via a promise-latch memo (one-time cost,
 * no top-level await).
 *
 * On Deno Deploy (and local runs with the KV flag) `Deno.openKv()` is available
 * and returns the real database handle. Deno 2.9 gates `Deno.openKv()` behind
 * `--unstable-kv`, and the task scripts (outside `src/`) cannot carry flags, so
 * when the API is absent the same code path runs against an in-memory store
 * with identical semantics (spec §5.2's "in dev and tests, `Deno.openKv()`
 * returns an in-memory backing store with identical API surface"). Only the
 * BeatADP daily cache is persisted server-side (§5.2/§5.3).
 */
export type KvStore = {
  get: (key: Deno.KvKey) => Promise<{ value: unknown }>;
  set: (key: Deno.KvKey, value: unknown, options?: { expireIn?: number }) => Promise<void>;
};

class InMemoryKv implements KvStore {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number | null }>();

  get(key: Deno.KvKey): Promise<{ value: unknown }> {
    const entry = this.entries.get(JSON.stringify(key));
    if (entry === undefined) {
      return Promise.resolve({ value: null });
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(JSON.stringify(key));
      return Promise.resolve({ value: null });
    }
    return Promise.resolve({ value: entry.value });
  }

  set(key: Deno.KvKey, value: unknown, options?: { expireIn?: number }): Promise<void> {
    this.entries.set(JSON.stringify(key), {
      value,
      expiresAt: options?.expireIn === undefined ? null : Date.now() + options.expireIn,
    });
    return Promise.resolve();
  }
}

/** Adapt the real Deno.Kv handle to the store surface used by the cache. */
function adaptRealKv(kv: Deno.Kv): KvStore {
  return {
    get: (key) => kv.get(key),
    set: async (key, value, options) => {
      await kv.set(key, value, { expireIn: options?.expireIn });
    },
  };
}

let kvPromise: Promise<KvStore> | null = null;

export function openKv(): Promise<KvStore> {
  kvPromise ??= typeof Deno.openKv === 'function' ? Deno.openKv().then(adaptRealKv) : Promise.resolve(new InMemoryKv());
  return kvPromise;
}
