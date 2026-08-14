/**
 * Manual steal/reach flag store tests (§8.2): toggle set/clear, exclusivity
 * (one flag per player), and clearFlags. The node test env has no IndexedDB,
 * so the storage adapter is mocked with an in-memory Map backing.
 */
import type * as StorageModule from '../lib/storage.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

const mockStore = new Map<string, string>();

vi.mock('../lib/storage.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    createIndexedDbStorage: (): StateStorage => ({
      getItem: (key) => Promise.resolve(mockStore.get(key) ?? null),
      setItem: (key, value) => Promise.resolve(mockStore.set(key, value)),
      removeItem: (key) => Promise.resolve(mockStore.delete(key)),
    }),
  };
});

import { useFlagsStore } from '../lib/store.ts';

describe('useFlagsStore', () => {
  beforeEach(() => {
    mockStore.clear();
    useFlagsStore.setState({ flags: {} });
  });

  it('sets a flag on first toggle', () => {
    useFlagsStore.getState().toggleFlag('WR:Lamb', 'steal');
    expect(useFlagsStore.getState().flags['WR:Lamb']).toBe('steal');
  });

  it('clears a flag when the same one is toggled again', () => {
    const { toggleFlag } = useFlagsStore.getState();
    toggleFlag('WR:Lamb', 'steal');
    toggleFlag('WR:Lamb', 'steal');
    expect(useFlagsStore.getState().flags['WR:Lamb']).toBeUndefined();
  });

  it('overwrites exclusivity: steal → reach and back', () => {
    const { toggleFlag } = useFlagsStore.getState();
    toggleFlag('WR:Lamb', 'steal');
    toggleFlag('WR:Lamb', 'reach');
    expect(useFlagsStore.getState().flags['WR:Lamb']).toBe('reach');
    toggleFlag('WR:Lamb', 'steal');
    expect(useFlagsStore.getState().flags['WR:Lamb']).toBe('steal');
  });

  it('keeps other players flags untouched when toggling one player', () => {
    const { toggleFlag } = useFlagsStore.getState();
    toggleFlag('WR:Lamb', 'steal');
    toggleFlag('RB:Hall', 'reach');
    expect(useFlagsStore.getState().flags).toEqual({ 'WR:Lamb': 'steal', 'RB:Hall': 'reach' });
  });

  it('clearFlags empties every flag', () => {
    const { toggleFlag, clearFlags } = useFlagsStore.getState();
    toggleFlag('WR:Lamb', 'steal');
    toggleFlag('RB:Hall', 'reach');
    clearFlags();
    expect(useFlagsStore.getState().flags).toEqual({});
  });
});
