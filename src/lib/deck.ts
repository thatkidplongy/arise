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

/** One stack in the picker: a material's cards, counted every way the row says. */
export interface Stack {
  name: string;
  total: number; // cards in the stack
  left: number; // still unmet today
  due: number; // cards the schedule owes today
  dueLeft: number; // due cards still unmet
}

function countInto(stack: Stack, id: string, met: Set<string>, due: Set<string>): void {
  stack.total += 1;
  if (!met.has(id)) stack.left += 1;
  if (!due.has(id)) return;
  stack.due += 1;
  if (!met.has(id)) stack.dueLeft += 1;
}

/** Every material in the deck as a pickable stack, in first-appearance order —
 * due items lead the deck, so the books owing work list first. */
export function listStacks(items: BringBack[], met: string[], dueIds: string[]): Stack[] {
  const metSet = new Set(met);
  const dueSet = new Set(dueIds);
  const out: Stack[] = [];
  const at = new Map<string, number>();
  for (const entry of items) {
    const name = materialOf(entry);
    if (!name) continue;
    let found = at.get(name);
    if (found === undefined) {
      found = out.length;
      at.set(name, found);
      out.push({ name, total: 0, left: 0, due: 0, dueLeft: 0 });
    }
    countInto(out[found], entry.id, metSet, dueSet);
  }
  return out;
}

/** One pile's counts — works for a material or for ALL_PILE, which no picker row names. */
export function stackOf(items: BringBack[], met: string[], dueIds: string[], pile: string): Stack {
  const metSet = new Set(met);
  const dueSet = new Set(dueIds);
  const stack: Stack = { name: pile, total: 0, left: 0, due: 0, dueLeft: 0 };
  for (const entry of items) {
    if (isInPile(entry, pile)) countInto(stack, entry.id, metSet, dueSet);
  }
  return stack;
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
