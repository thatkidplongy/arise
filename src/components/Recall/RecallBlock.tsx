import { RecallSession } from '@/components/Recall/RecallSession';
import { StackPicker } from '@/components/Recall/StackPicker';
import { buildBringBack } from '@/lib/bringBack';
import { ALL_PILE, deckFor, listStacks, stackOf } from '@/lib/deck';
import { dateKey } from '@/lib/dates';
import { useInsights } from '@/query/useInsights';
import { useRecallLibrary } from '@/query/useRecallLibrary';
import { useRecallDeck } from '@/store/useRecallDeck';
import { useSystem } from '@/store/useSystem';

/**
 * The recall corner of the Learn screen: pick a stack, then work it like a pile of
 * index cards. The deck behind it covers everything — the due handful first, then
 * tips, then the whole library in the day's shuffled order — and the walk survives
 * leaving the screen. Gone entirely on a day with nothing distilled or captured.
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

  // A pile chosen yesterday — or naming a stack with nothing in today's deck —
  // means the picker, not an empty session.
  const pile = deck.pile;
  if (pile === null || (pile !== ALL_PILE && !stacks.some((s) => s.name === pile))) {
    const whole = stackOf(items, state.met, dueIds, ALL_PILE);
    return <StackPicker stacks={stacks} dueLeft={whole.dueLeft} onPick={deck.setPile} />;
  }

  return <RecallSession items={items} state={state} pile={pile} dueIds={dueIds} />;
}
