/**
 * Zustand stores (§8.2), persisted to IndexedDB via the custom adapter (§7).
 * `settings`, `drafted`, and `flags` are the persisted slices; file/players/
 * adpCache live in idb-keyval directly (§7). No localStorage.
 */
import type { AppSettings, PlayerRecord, RosterSettings, ScoringSettings } from './types.ts';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from './settings.ts';
import { create } from 'zustand';
import { createIndexedDbStorage } from './storage.ts';

type SettingsState = {
  settings: AppSettings;
  setSettings: (patch: Partial<AppSettings>) => void;
  setScoring: (patch: Partial<ScoringSettings>) => void;
  setRoster: (patch: Partial<RosterSettings>) => void;
  replaceSettings: (settings: AppSettings) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },
      setScoring: (patch) => {
        set((state) => ({ settings: { ...state.settings, scoring: { ...state.settings.scoring, ...patch } } }));
      },
      setRoster: (patch) => {
        set((state) => ({ settings: { ...state.settings, roster: { ...state.settings.roster, ...patch } } }));
      },
      replaceSettings: (settings) => {
        set({ settings });
      },
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => createIndexedDbStorage('draftday')),
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);

type DraftState = {
  drafted: string[];
  toggleDrafted: (playerId: string) => void;
  clearDrafted: () => void;
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      drafted: [],
      toggleDrafted: (playerId) => {
        set((state) => ({
          drafted: state.drafted.includes(playerId)
            ? state.drafted.filter((id) => id !== playerId)
            : [...state.drafted, playerId],
        }));
      },
      clearDrafted: () => {
        set({ drafted: [] });
      },
    }),
    {
      name: 'drafted',
      storage: createJSONStorage(() => createIndexedDbStorage('draftday')),
      partialize: (state) => ({ drafted: state.drafted }),
    },
  ),
);

/** In-memory working state (parsed players); persisted separately in idb-keyval (§7). */
type PlayersState = {
  players: PlayerRecord[] | null;
  setPlayers: (players: PlayerRecord[] | null) => void;
};

export const usePlayersStore = create<PlayersState>()((set) => ({
  players: null,
  setPlayers: (players) => set({ players }),
}));

export type PlayerFlag = 'steal' | 'reach';

type FlagsState = {
  flags: Partial<Record<string, PlayerFlag>>;
  toggleFlag: (playerId: string, flag: PlayerFlag) => void;
  clearFlags: () => void;
};

export const useFlagsStore = create<FlagsState>()(
  persist(
    (set) => ({
      flags: {},
      toggleFlag: (playerId, flag) => {
        set((state) => {
          const next = { ...state.flags };
          if (next[playerId] === flag) {
            delete next[playerId];
          } else {
            next[playerId] = flag;
          }
          return { flags: next };
        });
      },
      clearFlags: () => {
        set({ flags: {} });
      },
    }),
    {
      name: 'flags',
      storage: createJSONStorage(() => createIndexedDbStorage('draftday')),
      partialize: (state) => ({ flags: state.flags }),
    },
  ),
);
