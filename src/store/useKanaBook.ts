import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { RecallGrade } from '@/lib/api';
import { dateKey } from '@/lib/dates';
import { gradeKana, type KanaBook } from '@/lib/kana';

/**
 * What you have met of the hiragana chart, and where each character sits on the
 * ladder — persisted, because a kana deck that forgets overnight is a chart you read
 * rather than a deck you learn.
 *
 * Local rather than server state on purpose: the chart is fixed and known, so there
 * is nothing to distil and nothing to sync — a highlight has to be made before it can
 * be scheduled, where こ has been こ the whole time. All the ladder logic lives in
 * lib/kana; this only holds the book and stamps today's date on a grade.
 *
 * Separate from useRecallDeck, which holds one day's walk through the piles and rolls
 * over every morning. This one is meant to accumulate.
 */
interface KanaBookStore {
  cards: KanaBook;
  grade: (char: string, value: RecallGrade) => void;
}

export const useKanaBook = create<KanaBookStore>()(
  persist(
    (set) => ({
      cards: {},
      grade: (char, value) => set((s) => ({ cards: gradeKana(s.cards, char, value, dateKey()) })),
    }),
    {
      name: 'arise-kana-hiragana-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
