import type { BringBack } from '@/lib/bringBack';
import { HIRAGANA_PILE, KANA_VIA } from '@/lib/kana';
import { chapterSpan } from '@/lib/reading';

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
 * by the server), the capture a tip came from, or the script a character belongs
 * to. Empty means unlabeled — those cards live only in the all-pile. */
export function materialOf(entry: BringBack): string {
  if (entry.kind === 'tip') return entry.source;
  if (entry.kind === 'kana') return HIRAGANA_PILE;
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

/**
 * One row on the shelf: a stack, plus the line that sits under its name.
 *
 * The byline is derived here rather than in the picker because it is read off the
 * cards themselves — where they were captured from, how many there are, which
 * chapters they came out of — and the picker only has the counts.
 */
export interface ShelfStack extends Stack {
  byline: string;
}

/** What a stack says about itself under its name: 'YouTube · 6 cards',
 * '22 cards · ch. 1–9'. The API carries no author, so a book leads with its count.
 *
 * The platform is dropped when the stack is already named after it — a capture
 * titled "YouTube" would otherwise read 'Tips · YouTube' over 'YouTube · 17 cards'. */
function bylineOf(stack: Stack, via: string, markers: string[], learned: number): string {
  const cards = `${stack.total} ${stack.total === 1 ? 'card' : 'cards'}`;
  const named = via && stack.name.toLocaleLowerCase().includes(via.toLocaleLowerCase());
  const progress = learned > 0 ? `${learned} learned` : '';
  return [named ? '' : via, cards, chapterSpan(markers), progress].filter(Boolean).join(' · ');
}

/** What a stack's byline leads with — where its cards were captured from, or the
 * track a script belongs to. A book says it with its chapters instead. */
function viaOf(entry: BringBack): string {
  if (entry.kind === 'tip') return entry.platform;
  if (entry.kind === 'kana') return KANA_VIA;
  return '';
}

/** Every material in the deck as a pickable stack, in first-appearance order —
 * due items lead the deck, so the books owing work list first. */
export function listStacks(items: BringBack[], met: string[], dueIds: string[]): ShelfStack[] {
  const metSet = new Set(met);
  const dueSet = new Set(dueIds);
  const out: ShelfStack[] = [];
  const at = new Map<string, number>();
  const vias: string[] = [];
  const markers: string[][] = [];
  // How many of a stack's cards have been met at least once. Only the kana chart
  // reports it: a chart is a fixed set you work through, so how far along you are is
  // the useful thing to say, where a book's stack is a pile of notes you wrote and
  // its size already says as much as there is to say.
  const learned: number[] = [];
  for (const entry of items) {
    const name = materialOf(entry);
    if (!name) continue;
    let found = at.get(name);
    if (found === undefined) {
      found = out.length;
      at.set(name, found);
      out.push({ name, total: 0, left: 0, due: 0, dueLeft: 0, byline: '' });
      vias.push('');
      markers.push([]);
      learned.push(0);
    }
    countInto(out[found], entry.id, metSet, dueSet);
    const via = viaOf(entry);
    if (via) vias[found] = vias[found] || via;
    if (entry.kind === 'recall') markers[found].push(entry.item.chapter);
    if (entry.kind === 'kana' && !entry.item.fresh) learned[found] += 1;
  }
  out.forEach((stack, n) => (stack.byline = bylineOf(stack, vias[n], markers[n], learned[n])));
  return out;
}

/** Whether a stack answers to what was typed — its name, or the line under it, so
 * searching a platform ('YouTube') or a chapter finds the stack that carries it. */
function stackMatches(stack: ShelfStack, query: string): boolean {
  return `${stack.name} ${stack.byline}`.toLocaleLowerCase().includes(query);
}

/**
 * Which stacks the picker puts on the shelf: what's due today, with everything else
 * behind the search — the three books owing work are the point of the screen, and a
 * list of every material ever read buries them.
 *
 * A day with nothing scheduled falls back to the whole shelf. There is nothing to
 * hide behind on that day, and an empty picker under a search box reads as a screen
 * that has failed rather than one with no work to hand out.
 */
export function pickShelf(stacks: ShelfStack[], query: string, showAll: boolean): ShelfStack[] {
  const typed = query.trim().toLocaleLowerCase();
  if (typed) return stacks.filter((s) => stackMatches(s, typed));
  if (showAll) return stacks;
  const owing = stacks.filter((s) => s.due > 0);
  return owing.length > 0 ? owing : stacks;
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
