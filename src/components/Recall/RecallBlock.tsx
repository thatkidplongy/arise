import { router } from 'expo-router';

import { StackPicker } from '@/components/Recall/StackPicker';
import { buildBringBack } from '@/lib/bringBack';
import { ALL_PILE, deckFor, listStacks, stackOf } from '@/lib/deck';
import { dateKey } from '@/lib/dates';
import { useInsights } from '@/query/useInsights';
import { useRecallLibrary } from '@/query/useRecallLibrary';
import { useRecallDeck } from '@/store/useRecallDeck';
import { useSystem } from '@/store/useSystem';

/**
 * The recall corner of the Learn screen: the shelf of stacks, and nothing else.
 * Picking one pushes /recall — a sitting is a place you go, with its own screen
 * and its own back, not a card that swaps its face mid-scroll. Gone entirely on a
 * day with nothing distilled or captured.
 */
export function RecallBlock() {
  const recall = useSystem((s) => s.state?.recall) ?? [];
  const { insights } = useInsights();
  const library = useRecallLibrary();
  const deck = useRecallDeck();

  const items = buildBringBack(recall, insights, library);
  if (!items.length) return null;

  const state = deckFor(dateKey(), deck);
  const dueIds = recall.map((r) => r.id);
  const stacks = listStacks(items, state.met, dueIds);
  const whole = stackOf(items, state.met, dueIds, ALL_PILE);

  return (
    <StackPicker
      stacks={stacks}
      dueLeft={whole.dueLeft}
      onPick={(pile) => router.push({ pathname: '/recall', params: { pile } })}
    />
  );
}
