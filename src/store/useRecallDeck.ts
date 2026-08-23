import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BringBack } from '@/lib/bringBack';
import { deckFor, meetCard, missCard, restartPile, type DeckState } from '@/lib/deck';
import { dateKey } from '@/lib/dates';

/**
 * Today's walk through the recall piles, persisted so leaving the screen — or the
 * app — doesn't put met cards back in your hand. All pile logic lives in lib/deck;
 * this only holds the state and rolls it over when the date turns.
 */
interface RecallDeckStore extends DeckState {
  day: string;
  /** The stack being drilled — a material name, ALL_PILE for the mix, or null
   * while the picker is showing. Each morning starts back at the picker. */
  pile: string | null;
  setPile: (pile: string | null) => void;
  meet: (id: string) => void;
  miss: (id: string) => void;
  restart: (items: BringBack[], pile: string) => void;
}

/** Apply a deck move to today's state — rolled fresh first if the date has turned. */
function onToday(s: RecallDeckStore, move: (state: DeckState) => DeckState): Partial<RecallDeckStore> {
  const day = dateKey();
  return { day, pile: s.day === day ? s.pile : null, ...move(deckFor(day, s)) };
}

export const useRecallDeck = create<RecallDeckStore>()(
  persist(
    (set) => ({
      day: '',
      pile: null,
      met: [],
      deferred: {},
      ticks: 0,
      setPile: (pile) => set({ pile }),
      meet: (id) => set((s) => onToday(s, (state) => meetCard(state, id))),
      miss: (id) => set((s) => onToday(s, (state) => missCard(state, id))),
      restart: (items, pile) => set((s) => onToday(s, (state) => restartPile(state, items, pile))),
    }),
    {
      name: 'arise-recall-deck-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
    },
  ),
);
