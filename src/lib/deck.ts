import type { BringBack } from '@/lib/bringBack';

/**
 * The index-card pile behind the recall card.
 *
 * The deck (see buildBringBack) is sorted into piles by material — one per book or
 * capture, plus one holding everything — and each pile is worked through like a
 * physical stack: a card you meet leaves the pile for the day, a card you miss
 * comes back a few cards later, and the pile has an end.
 *
 * Everything here is a pure read over the deck plus a tiny persisted state — which
 * cards were met today, which were missed and when. Pile order is derived fresh
 * each render rather than stored, so cards arriving mid-day (the library loads
 * after the due set; a capture can land any time) just appear, with nothing to sync.
 */

/** The pile holding every material at once — due items first, since the deck is. */
export const ALL_PILE = 'all';

/** How many other cards a missed one waits behind before it's asked again — near
 * the front of the pile, per the index-card method, but not the very next card. */
const MISSED_RETURN = 3;

export interface DeckState {
  /** Cards finished today — tapped past, or graded got/shaky. */
  met: string[];
  /** Cards graded missed: the tick count at which each becomes askable again. */
  deferred: Record<string, number>;
  /** Cards moved past today, met or missed — the clock `deferred` is read against. */
  ticks: number;
}

export const EMPTY_DECK: DeckState = { met: [], deferred: {}, ticks: 0 };

/** The stored state if it's from `day`, or a fresh one — piles reset each morning. */
export function deckFor(day: string, stored: { day: string } & DeckState): DeckState {
  if (stored.day !== day) return EMPTY_DECK;
  return { met: stored.met, deferred: stored.deferred, ticks: stored.ticks };
}

/** The material an entry files under: the book (chapter markers already stripped
 * by the server), or the capture a tip came from. Empty means unlabeled — those
 * cards live only in the all-pile. */
export function materialOf(entry: BringBack): string {
  if (entry.kind === 'tip') return entry.source;
  return entry.item.material;
}

function isInPile(entry: BringBack, pile: string): boolean {
  return pile === ALL_PILE || materialOf(entry) === pile;
}

/** Every material in the deck with how many of its cards are still unmet, in
 * first-appearance order — due items lead the deck, so books owing work list first. */
export function listMaterials(items: BringBack[], met: string[]): { name: string; left: number }[] {
  const metSet = new Set(met);
  const out: { name: string; left: number }[] = [];
  const at = new Map<string, number>();
  for (const entry of items) {
    const name = materialOf(entry);
    if (!name) continue;
    const found = at.get(name);
    if (found === undefined) {
      at.set(name, out.length);
      out.push({ name, left: metSet.has(entry.id) ? 0 : 1 });
    } else if (!metSet.has(entry.id)) {
      out[found].left += 1;
    }
  }
  return out;
}

/**
 * The card the pile is showing: the first unmet entry whose deferral has run out.
 *
 * When only deferred cards remain, the earliest one shows anyway — the pile has
 * wrapped around to it, and holding it back would end the pile with cards unasked.
 * Null means every card is met: the pile is done for the day.
 */
export function currentEntry(items: BringBack[], pile: string, state: DeckState): BringBack | null {
  const metSet = new Set(state.met);
  let waiting: BringBack | null = null;
  for (const entry of items) {
    if (!isInPile(entry, pile) || metSet.has(entry.id)) continue;
    const due = state.deferred[entry.id];
    if (due === undefined || due <= state.ticks) return entry;
    waiting = waiting ?? entry;
  }
  return waiting;
}

/** How far through the pile today is: cards met, out of cards in the pile. */
export function pileProgress(items: BringBack[], pile: string, met: string[]): { done: number; total: number } {
  const metSet = new Set(met);
  let done = 0;
  let total = 0;
  for (const entry of items) {
    if (!isInPile(entry, pile)) continue;
    total += 1;
    if (metSet.has(entry.id)) done += 1;
  }
  return { done, total };
}

/** Move past a card — tapped along, or graded got/shaky. It leaves today's pile. */
export function meetCard(state: DeckState, id: string): DeckState {
  const deferred = { ...state.deferred };
  delete deferred[id];
  const met = state.met.includes(id) ? state.met : [...state.met, id];
  return { met, deferred, ticks: state.ticks + 1 };
}

/** A missed card goes back into the pile a few positions ahead — asked again this
 * session, almost immediately. Missing also un-meets it: a card tapped past and
 * then graded missed still owes today an answer. */
export function missCard(state: DeckState, id: string): DeckState {
  const ticks = state.ticks + 1;
  return {
    met: state.met.filter((m) => m !== id),
    deferred: { ...state.deferred, [id]: ticks + MISSED_RETURN },
    ticks,
  };
}

/** Go again: put one pile's cards back, leaving every other pile's day intact. */
export function restartPile(state: DeckState, items: BringBack[], pile: string): DeckState {
  const ids = new Set(items.filter((e) => isInPile(e, pile)).map((e) => e.id));
  const deferred = { ...state.deferred };
  for (const id of ids) delete deferred[id];
  return { met: state.met.filter((m) => !ids.has(m)), deferred, ticks: state.ticks };
}
