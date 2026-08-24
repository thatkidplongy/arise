import { buildBringBack, type BringBack } from '@/lib/bringBack';
import { deckFor, type DeckState } from '@/lib/deck';
import { dateKey } from '@/lib/dates';
import { buildKanaDeck, kanaId } from '@/lib/kana';
import { useInsights } from '@/query/useInsights';
import { useRecallLibrary } from '@/query/useRecallLibrary';
import { useKanaBook } from '@/store/useKanaBook';
import { useRecallDeck } from '@/store/useRecallDeck';
import { useSystem } from '@/store/useSystem';

/**
 * The whole recall deck, derived in one place: every card, which of them the schedule
 * owes today, and how far through today's pile you are.
 *
 * The shelf on Learn and the sitting on /recall both need all three, and they used to
 * assemble them separately — which meant a fourth source of cards had to be wired in
 * twice and could quietly disagree between the two screens about what was due. This
 * owns it; the surfaces read it.
 */
export function useRecallCards(): { items: BringBack[]; dueIds: string[]; state: DeckState } {
  const recall = useSystem((s) => s.state?.recall);
  const { insights } = useInsights();
  const library = useRecallLibrary();
  const book = useKanaBook((s) => s.cards);
  const deck = useRecallDeck();

  const day = dateKey();
  const due = recall ?? [];
  const kana = buildKanaDeck(book, day);

  return {
    items: buildBringBack(due, insights, library, kana),
    dueIds: [...due.map((r) => r.id), ...kana.filter((k) => k.due).map((k) => kanaId(k.char))],
    state: deckFor(day, deck),
  };
}
