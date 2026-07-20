/** A one-line plain-text preview of a (possibly markdown) note, for table rows.
 * Takes the first non-empty line and strips the leading markers our small
 * Markdown renderer understands (#, >, -, *, `1.`) so the row reads cleanly. */
export function snippet(value: string): string {
  const line = value
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return line
    .replace(/^#{1,3}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}
