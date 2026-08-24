import type { RecallGrade } from '@/lib/api';
import { addDays } from '@/lib/dates';

/**
 * The hiragana chart as a pile of index cards, and the ladder that decides when a
 * character comes back.
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

/** Which part of the chart a character comes from. */
export type KanaGroup = 'base' | 'dakuten' | 'handakuten' | 'combo';

/** What each part is called, short enough for a card's corner. */
export const KANA_GROUPS: Record<KanaGroup, string> = {
  base: 'plain chart',
  dakuten: 'dakuten',
  handakuten: 'handakuten',
  combo: 'combination',
};

/** The row a character sits in, as a chart prints it — so a card's back can show the
 * company it keeps rather than the character alone. Shared by the row's members. */
export interface KanaRow {
  /** The row's own name: the character that opens it. */
  label: string;
  chars: string[];
  romaji: string[];
}

/** One character of the chart. */
export interface Kana {
  char: string;
  romaji: string;
  group: KanaGroup;
  row: KanaRow;
  /** The plain character this one is built out of — '' on the plain chart itself. */
  from: string;
  /** What trips people up on this character, where anything does. */
  note: string;
}

/**
 * The chart, row by row, in the order it is learned: the plain rows first, then the
 * voiced ones, then the combinations — which is also the order the deck introduces
 * them, so you never meet じゃ before you have met し and や.
 *
 * `from` reads two ways, by group: on a dakuten or handakuten row it names the plain
 * row being marked, and the character lines up index for index (が from か, ぎ from
 * き). On a combination row it names the single character the small ゃゅょ hangs off.
 */
interface RowSpec {
  group: KanaGroup;
  from: string;
  kana: [string, string][];
}

const ROWS: RowSpec[] = [
  { group: 'base', from: '', kana: [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o']] },
  { group: 'base', from: '', kana: [['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko']] },
  { group: 'base', from: '', kana: [['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so']] },
  { group: 'base', from: '', kana: [['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to']] },
  { group: 'base', from: '', kana: [['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no']] },
  { group: 'base', from: '', kana: [['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho']] },
  { group: 'base', from: '', kana: [['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo']] },
  { group: 'base', from: '', kana: [['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo']] },
  { group: 'base', from: '', kana: [['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro']] },
  { group: 'base', from: '', kana: [['わ', 'wa'], ['を', 'wo']] },
  { group: 'base', from: '', kana: [['ん', 'n']] },
  { group: 'dakuten', from: 'か', kana: [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go']] },
  { group: 'dakuten', from: 'さ', kana: [['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo']] },
  { group: 'dakuten', from: 'た', kana: [['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do']] },
  { group: 'dakuten', from: 'は', kana: [['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']] },
  { group: 'handakuten', from: 'は', kana: [['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']] },
  { group: 'combo', from: 'き', kana: [['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo']] },
  { group: 'combo', from: 'し', kana: [['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho']] },
  { group: 'combo', from: 'ち', kana: [['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho']] },
  { group: 'combo', from: 'に', kana: [['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo']] },
  { group: 'combo', from: 'ひ', kana: [['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo']] },
  { group: 'combo', from: 'み', kana: [['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo']] },
  { group: 'combo', from: 'り', kana: [['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo']] },
  { group: 'combo', from: 'ぎ', kana: [['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo']] },
  { group: 'combo', from: 'じ', kana: [['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo']] },
  { group: 'combo', from: 'び', kana: [['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo']] },
  { group: 'combo', from: 'ぴ', kana: [['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']] },
];

/**
 * The handful of characters where the sound on the back isn't the whole story — a
 * particle read one way and written another, two spellings of one sound, a small つ
 * that isn't read at all.
 *
 * Only the genuine traps are here. A note on every character would be forty lines of
 * filler that trains you to stop reading the notes.
 */
const NOTES: Record<string, string> = {
  し: 'Always “shi”, never “si”.',
  ち: 'Always “chi”, never “ti”.',
  つ: 'A small っ before another character doubles that consonant instead of being read.',
  は: 'Said “ha” inside a word, but “wa” when it is the topic particle.',
  ふ: 'Somewhere between “fu” and “hu” — the lips never quite meet.',
  へ: 'Said “he”, but “e” when it is the particle pointing somewhere.',
  を: 'Written “wo”, said “o”. You will meet it almost only as the object particle.',
  ん: 'The one character that is a consonant by itself, and it never opens a word.',
  じ: 'Reads “ji”, and it is the everyday one — ぢ is rare.',
  ぢ: 'Reads “ji” too, but it is rare. Reach for じ unless a word says otherwise.',
  ず: 'Reads “zu”, and it is the everyday one — づ is rare.',
  づ: 'Reads “zu” too, but it is rare. Reach for ず unless a word says otherwise.',
};

function buildChart(): Kana[] {
  const rows = new Map<string, KanaRow>();
  const out: Kana[] = [];
  for (const spec of ROWS) {
    const row: KanaRow = {
      label: spec.kana[0][0],
      chars: spec.kana.map(([char]) => char),
      romaji: spec.kana.map(([, romaji]) => romaji),
    };
    rows.set(row.label, row);
    spec.kana.forEach(([char, romaji], at) => {
      // A marked row lines up with the plain row it marks; a combination row hangs
      // every one of its characters off the same plain character.
      const plain = rows.get(spec.from);
      const from = spec.group === 'combo' ? spec.from : (plain?.chars[at] ?? '');
      out.push({ char, romaji, group: spec.group, row, from, note: NOTES[char] ?? '' });
    });
  }
  return out;
}

/** Every hiragana character, in the order it is learned. */
export const HIRAGANA: Kana[] = buildChart();

/** The stack the chart files under on the recall shelf. */
export const HIRAGANA_PILE = 'Hiragana';

/** What the shelf says a kana stack came from, where a book says its chapters. */
export const KANA_VIA = 'Japanese';

/** How a character is built out of a plainer one — the line the back of a marked or
 * combined card carries. Empty on the plain chart, which is built out of nothing. */
export function describeKanaBuild(kana: Kana): string {
  if (!kana.from) return '';
  if (kana.group === 'dakuten') return `${kana.from} with a dakuten (゛) — ${kana.from} voiced.`;
  if (kana.group === 'handakuten') return `${kana.from} with a handakuten (゜).`;
  return `${kana.from} with a small ${kana.char.slice(1)} — one sound, not two.`;
}

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
