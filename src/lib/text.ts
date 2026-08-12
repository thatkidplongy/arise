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
