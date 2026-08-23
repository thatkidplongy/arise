// The inline marks our small Markdown renderer understands, as one alternation in
// its order: `code` first (its content is literal, so ** inside it stays as typed),
// then the two-character marks before the one-character ones so **x** isn't read as
// a pair of italics.
const INLINE = /`([^`\n]+)`|~~([^~\n]+)~~|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;

/** Drop the inline marks from a line, keeping the text they wrapped. */
function stripInline(line: string): string {
  return line.replace(INLINE, (match: string, ...rest: unknown[]) => {
    const inner = rest.find((group): group is string => typeof group === 'string');
    return inner ?? match;
  });
}

const COUNT_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

/** A small count as a word — 'nine', the way a sentence would say it. Numerals past
 * twelve: 'thirteen cards' reads slower than '13 cards', not warmer. */
export function spellCount(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

// What a title can open with that isn't its first letter: whitespace, an opening
// quote or bracket, a markdown mark, a leading dash or dot.
const BEFORE_THE_NAME = /^[\s"'“‘([#*_·—–.-]+/;

/** The first character of a name, uppercased. Anything a title merely opens with is
 * skipped first, and the character is taken by code point so an emoji or an astral
 * letter isn't cut in half. */
export function initialOf(name: string): string {
  const [first] = [...name.replace(BEFORE_THE_NAME, '')];
  return first ? first.toLocaleUpperCase() : '';
}

// Words a title leans on but isn't known by. They never open the initials and never
// earn a letter of their own — 'The Psychology of Money' is PM on its spine.
const MINOR_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'your', 'my', 'at']);

/** What separates one word of a title from the next — spaces, and the punctuation a
 * material's name collects: 'Tips · YouTube', 'Japanese — hiragana'. */
const BETWEEN_WORDS = /[\s·—–,:;/&()[\]"'“”|]+/;

/** How many letters fit across a spine before they stop being initials. */
const SPINE_MAX = 4;

/**
 * A title as the initials stamped on a book's spine: 'Thinking, fast and slow' ->
 * TFS, 'Tips · YouTube' -> TY, 'The Psychology of Money' -> PM.
 *
 * A one-word title has no initials to take, so it keeps what it already is: an
 * acronym or a script with no case of its own stands as written ('DDIA', '日本語'),
 * and an ordinary word gives up its first letter alone ('Meditations' -> M).
 */
export function initialsOf(name: string): string {
  const words = name.split(BETWEEN_WORDS).filter((w) => w.length > 0);
  const named = words.filter((w) => !MINOR_WORDS.has(w.toLowerCase()));
  const taken = named.length > 0 ? named : words;
  if (taken.length === 0) return '';
  if (taken.length === 1) {
    const only = taken[0];
    const isCaseless = only === only.toLocaleUpperCase();
    return isCaseless ? [...only].slice(0, SPINE_MAX).join('') : initialOf(only);
  }
  return taken.slice(0, SPINE_MAX - 1).map(initialOf).join('');
}

/** A one-line plain-text preview of a (possibly markdown) note, for table rows.
 * Takes the first non-empty line and strips the markers our small Markdown renderer
 * understands — the leading block ones (#, >, -, *, `1.`) and the inline ones
 * (**bold**, _italic_, ~~strike~~, `code`) — so the row reads as written, not as
 * typed. */
export function snippet(value: string): string {
  const line = value
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return stripInline(
    line
      .replace(/^#{1,3}\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, ''),
  ).trim();
}
