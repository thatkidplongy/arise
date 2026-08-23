import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BringBack } from '@/lib/bringBack';
import { deckFor, meetCard, missCard, restartPile, type DeckState } from '@/lib/deck';
import { dateKey } from '@/lib/dates';

/**
 * Today's walk through the recall piles, persisted so leaving the screen — or the
 * app — doesn't put met cards back in your hand. Which pile is open lives in the
 * route, not here: /recall?pile=… is the session, and Learn is the picker. All
 * pile logic lives in lib/deck; this only holds the day's state and rolls it over
 * when the date turns.
 */
interface RecallDeckStore extends DeckState {
  day: string;
  meet: (id: string) => void;
  miss: (id: string) => void;
  restart: (items: BringBack[], pile: string) => void;
}

/** Apply a deck move to today's state — rolled fresh first if the date has turned. */
function onToday(s: RecallDeckStore, move: (state: DeckState) => DeckState): Partial<RecallDeckStore> {
  const day = dateKey();
  return { day, ...move(deckFor(day, s)) };
}

export const useRecallDeck = create<RecallDeckStore>()(
  persist(
    (set) => ({
      day: '',
      met: [],
      deferred: {},
      ticks: 0,
      meet: (id) => set((s) => onToday(s, (state) => meetCard(state, id))),
      miss: (id) => set((s) => onToday(s, (state) => missCard(state, id))),
      restart: (items, pile) => set((s) => onToday(s, (state) => restartPile(state, items, pile))),
    }),
    {
      name: 'arise-recall-deck-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
    },
  ),
);
