/**
 * Zustand stores (§8.2), persisted to IndexedDB via the custom adapter (§7).
 * `settings` and `drafted` are the persisted slices; file/players/adpCache live
 * in idb-keyval directly (§7). No localStorage.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppSettings, ScoringSettings, RosterSettings } from './types.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
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
      setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      setScoring: (patch) =>
        set((state) => ({ settings: { ...state.settings, scoring: { ...state.settings.scoring, ...patch } } })),
      setRoster: (patch) =>
        set((state) => ({ settings: { ...state.settings, roster: { ...state.settings.roster, ...patch } } })),
      replaceSettings: (settings) => set({ settings }),
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
      toggleDrafted: (playerId) =>
        set((state) => ({
          drafted: state.drafted.includes(playerId)
            ? state.drafted.filter((id) => id !== playerId)
            : [...state.drafted, playerId],
        })),
      clearDrafted: () => set({ drafted: [] }),
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
  players: import('./types.ts').PlayerRecord[] | null;
  setPlayers: (players: import('./types.ts').PlayerRecord[] | null) => void;
};

export const usePlayersStore = create<PlayersState>()((set) => ({
  players: null,
  setPlayers: (players) => set({ players }),
}));
