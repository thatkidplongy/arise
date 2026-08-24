import { router } from 'expo-router';

import { StackPicker } from '@/components/Recall/StackPicker';
import { useRecallCards } from '@/hooks/useRecallCards';
import { ALL_PILE, listStacks, stackOf } from '@/lib/deck';

/**
 * The recall corner of the Learn screen: the shelf of stacks, and nothing else.
 * Picking one pushes /recall — a sitting is a place you go, with its own screen
 * and its own back, not a card that swaps its face mid-scroll.
 *
 * The shelf is always there now: the hiragana chart is a fixed stack that needs
 * nothing distilled, so even a first morning has something to test yourself on.
 */
export function RecallBlock() {
  const { items, dueIds, state } = useRecallCards();
  if (!items.length) return null;

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
