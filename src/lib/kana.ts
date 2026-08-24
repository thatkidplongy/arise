import type { RecallGrade } from '@/lib/api';
import { addDays } from '@/lib/dates';
import { HIRAGANA, type Kana } from '@/lib/kanaChart';

/**
 * The hiragana chart as a pile of index cards: which characters today asks for, and
 * the ladder that decides when one comes back. The chart itself lives in lib/kanaChart.
 *
 * The Japanese track starts on hiragana (see DESIGN.md and the d-jp quest plan) and
 * the quest hands out a row at a time. What the quest can't do is ask you. This is
 * the asking half: the same physical index card the highlights use, with a character
 * on the front and its sound on the back.
 *
 * Unlike a highlight, a kana card isn't distilled from anything — the chart is fixed
 * and known, so it needs no server. The whole thing is a pure read over the chart
 * plus a small persisted book (see store/useKanaBook), which is what lets the deck
 * hand out today's work without a round trip.
 *
 * The ladder mirrors backend/app/recall.py's RECALL_INTERVALS on purpose: a card is
 * a card, and two different spacings on one screen would be two different promises.
 */

/** The stack the chart files under on the recall shelf. */
export const HIRAGANA_PILE = 'Hiragana';

/** What the shelf says a kana stack came from, where a book says its chapters. */
export const KANA_VIA = 'Japanese';

// The same expanding ladder the server runs highlights on (RECALL_INTERVALS in
// backend/app/recall.py): forgetting is steepest in the first days, so the early
// touches sit close together and the later ones stretch out.
const KANA_INTERVALS = [1, 3, 7, 16, 35];

/** How many characters the deck is willing to introduce in one day — one row of the
 * chart, which is exactly what the Japanese quest hands out. Meeting the whole chart
 * at once is how a kana deck becomes a wall you stop climbing. */
export const KANA_NEW_PER_DAY = 5;

/** Where one character stands: its rung, when it comes back, and the two days that
 * pace the deck. */
export interface KanaProgress {
  box: number;
  /** 'YYYY-MM-DD' it next comes due. */
  due: string;
  /** 'YYYY-MM-DD' it was first met — what the daily intake is counted against. */
  first: string;
  /** 'YYYY-MM-DD' it was last graded — what holds today's set together. */
  last: string;
  seen: number;
}

/** What you have met of the chart, by character. Absent means never met. */
export type KanaBook = Record<string, KanaProgress>;

/** Days until a character on `box` comes back. Past the last rung it stays there. */
export function kanaIntervalFor(box: number): number {
  return KANA_INTERVALS[Math.min(Math.max(box, 0), KANA_INTERVALS.length - 1)];
}

/** A character as the pile hands it to you: the chart entry, where it stands, and
 * what each grade would do — so the buttons can say it before being pressed. */
export interface KanaItem extends Kana {
  box: number;
  seen: number;
  /** Never met before — today would be the first time. */
  fresh: boolean;
  /** The schedule is asking for this one today. */
  due: boolean;
  ifMissed: number;
  ifShaky: number;
  ifGot: number;
}

/** The card's id in the recall deck — prefixed so a character can't collide with a
 * highlight's id. */
export function kanaId(char: string): string {
  return `kana-${char}`;
}

/**
 * Whether a character counts as today's work: it has come due, or it was already
 * worked today.
 *
 * The second half is what keeps the count honest. Grading pushes a card's due date
 * into the future, and without this the day's set would shrink by one every time you
 * answered — the pile telling you there are four left as you meet the fourth of five.
 */
function isDueOn(progress: KanaProgress, day: string): boolean {
  return progress.due <= day || progress.last === day;
}

function itemFor(kana: Kana, progress: KanaProgress | undefined, due: boolean): KanaItem {
  const box = progress?.box ?? 0;
  return {
    ...kana,
    box,
    seen: progress?.seen ?? 0,
    fresh: progress === undefined,
    due,
    ifMissed: kanaIntervalFor(0),
    ifShaky: kanaIntervalFor(box),
    ifGot: kanaIntervalFor(box + 1),
  };
}

/**
 * Today's walk through the chart: what the ladder owes, then the day's new
 * characters, then the rest of the chart in learning order.
 *
 * The tail is deliberately there rather than cut off at the due set. A stack you can
 * only open when the schedule says so is a stack you can't drill the morning before
 * a lesson, and the shelf's whole promise is that testing yourself early is allowed.
 */
export function buildKanaDeck(book: KanaBook, day: string): KanaItem[] {
  const met = HIRAGANA.filter((k) => book[k.char] !== undefined);
  const introducedToday = met.filter((k) => book[k.char].first === day).length;
  const room = Math.max(0, KANA_NEW_PER_DAY - introducedToday);

  const owed = met
    .filter((k) => isDueOn(book[k.char], day))
    .sort((a, b) => book[a.char].due.localeCompare(book[b.char].due));
  const unmet = HIRAGANA.filter((k) => book[k.char] === undefined);
  const intake = unmet.slice(0, room);

  const dueChars = new Set([...owed, ...intake].map((k) => k.char));
  const due = [...owed, ...intake].map((k) => itemFor(k, book[k.char], true));
  const rest = HIRAGANA.filter((k) => !dueChars.has(k.char)).map((k) => itemFor(k, book[k.char], false));
  return [...due, ...rest];
}

/** Which rung a grade lands a character on: up one for a hit, back to the front for
 * a miss, and nowhere at all for a shaky one — seen again at the same spacing, not
 * further out. */
function nextBox(was: number, grade: RecallGrade): number {
  if (grade === 'got') return was + 1;
  if (grade === 'missed') return 0;
  return was;
}

/**
 * Record how a character went, and reschedule it.
 *
 * Straight from the index-card method, same as the server does for a highlight: one
 * you knew goes to the back of the pile, one you half-knew keeps its place, one you
 * had no clue about drops to the front.
 */
export function gradeKana(book: KanaBook, char: string, grade: RecallGrade, day: string): KanaBook {
  const before = book[char];
  const box = nextBox(before?.box ?? 0, grade);
  return {
    ...book,
    [char]: {
      box,
      due: addDays(day, kanaIntervalFor(box)),
      first: before?.first || day,
      last: day,
      seen: (before?.seen ?? 0) + 1,
    },
  };
}

/** How much of the chart you have met, for the line under the stack's name. */
export function countKanaMet(book: KanaBook): number {
  return HIRAGANA.filter((k) => book[k.char] !== undefined).length;
}
