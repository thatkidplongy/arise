import { wordFor } from '@/lib/kanaWords';

/**
 * The hiragana chart itself — the characters, the rows they sit in, the traps, and a
 * word apiece.
 *
 * Data only, and separate from lib/kana on purpose: the chart is fixed and finished
 * where the ladder and the pile around it are not, so the two change for entirely
 * different reasons. Nothing here reads any state.
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

/** A real word the character turns up in, spelled without a single kanji. */
export interface KanaWord {
  /** The word in hiragana: 'なっとう'. */
  word: string;
  /** How it is read, macrons and all: 'nattō'. */
  romaji: string;
  /** What it means. */
  gloss: string;
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
  /** A word to see it working — null on the one character that turns up almost
   * only in borrowed words, which are written in katakana anyway. */
  word: KanaWord | null;
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
  みゅ: 'Turns up almost only in borrowed words, and those are written in katakana.',
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
      out.push({ char, romaji, group: spec.group, row, from, note: NOTES[char] ?? '', word: wordFor(char) });
    });
  }
  return out;
}

/** Every hiragana character, in the order it is learned. */
export const HIRAGANA: Kana[] = buildChart();

/** How a character is built out of a plainer one — the line the back of a marked or
 * combined card carries. Empty on the plain chart, which is built out of nothing. */
export function describeKanaBuild(kana: Kana): string {
  if (!kana.from) return '';
  if (kana.group === 'dakuten') return `${kana.from} with a dakuten (゛) — ${kana.from} voiced.`;
  if (kana.group === 'handakuten') return `${kana.from} with a handakuten (゜).`;
  return `${kana.from} with a small ${kana.char.slice(1)} — one sound, not two.`;
}

/** One piece of a word, and what that piece is doing there. */
export interface WordUnit {
  /** The characters the piece is written with — 'きゃ', 'っ', 'な'. */
  chars: string;
  /** Its job in the word: which row it came from, or which rule it is. */
  says: string;
}

const BY_CHAR = new Map(HIRAGANA.map((k) => [k.char, k]));

const SMALL = new Set(['ゃ', 'ゅ', 'ょ']);
const VOWEL_OF: Record<string, string> = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o' };
const LONG: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };

/** The vowel a piece leaves ringing, for the piece after it to lengthen or not. 'n'
 * and a small つ leave nothing. */
function tailVowel(romaji: string): string {
  const last = romaji.slice(-1);
  return 'aiueo'.includes(last) ? last : '';
}

/**
 * Whether a vowel character written after the sound `prev` stretches it instead of
 * sounding on its own: とう is 'tō', but だい is 'dai', not 'dā'.
 *
 * The same vowel twice always stretches. The two odd ones are Japanese's own
 * spellings — う after an o stretches the o, and い after an e stretches the e.
 */
function lengthens(vowel: string, prev: string): boolean {
  if (!prev) return false;
  if (vowel === prev) return true;
  if (vowel === 'u' && prev === 'o') return true;
  return vowel === 'i' && prev === 'e';
}

/**
 * A hiragana word split into the pieces a reader actually decodes, each labelled
 * with what it is doing.
 *
 * Not one character per piece, because that is the lie that makes なっとう unreadable:
 * a small ゃゅょ belongs to the character before it, a small つ is a pause rather than
 * a sound, and a vowel can be a held note on the vowel before it instead of a beat of
 * its own. Those three rules are the whole difference between reading the chart and
 * reading a word, so the split is where they get named.
 */
export function breakKanaWord(word: string): WordUnit[] {
  const out: WordUnit[] = [];
  let prev = '';
  let at = 0;
  while (at < word.length) {
    const char = word[at];
    const combo = SMALL.has(word[at + 1] ?? '') ? BY_CHAR.get(word.slice(at, at + 2)) : undefined;
    if (char === 'っ') {
      out.push({ chars: char, says: 'a small つ — a held beat that doubles the next consonant' });
      prev = '';
      at += 1;
    } else if (combo) {
      out.push({ chars: combo.char, says: `${combo.romaji} — the ${combo.row.label} row` });
      prev = tailVowel(combo.romaji);
      at += 2;
    } else if (VOWEL_OF[char] && lengthens(VOWEL_OF[char], prev)) {
      out.push({ chars: char, says: `holds the sound on — a long ${LONG[prev]}` });
      at += 1;
    } else {
      const kana = BY_CHAR.get(char);
      out.push({ chars: char, says: kana ? `${kana.romaji} — the ${kana.row.label} row` : '' });
      prev = kana ? tailVowel(kana.romaji) : '';
      at += 1;
    }
  }
  return out;
}
