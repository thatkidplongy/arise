import { Platform, StyleSheet, Text, View } from 'react-native';

import { surface, text as palette, withAlpha } from '@/theme';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * A deliberately small Markdown renderer — the readable basics the note editor
 * offers: headings (#, ##, ###), **bold**, *italic* / _italic_, ~~strike~~,
 * `inline code`, ```fenced code blocks```, `-`/`*` and `1.` lists, and `>` quotes,
 * with blank lines separating paragraphs. Not a full parser (no nesting, links,
 * etc.); anything it doesn't recognise renders as plain text, so nothing is lost.
 */

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*(\d+)\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```/;
// One regex for every inline mark; `code` first (its content is literal), then the
// longest (bold/strike) alternatives so **x** isn't mistaken for two italics.
const INLINE = /(`[^`\n]+`|~~[^~\n]+~~|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

function parseInline(line: string, keyBase: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push(
        <Text key={`${keyBase}-c${i}`} style={styles.code}>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(
        <Text key={`${keyBase}-b${i}`} style={styles.bold}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith('~~')) {
      out.push(
        <Text key={`${keyBase}-s${i}`} style={styles.strike}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else {
      out.push(
        <Text key={`${keyBase}-i${i}`} style={styles.italic}>
          {tok.slice(1, -1)}
        </Text>,
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function Markdown({ value, color }: { value: string; color?: string }) {
  const base = [styles.line, color ? { color } : null];
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const key = `l${idx}`;

    // Fenced code block: everything between ``` and the next ``` renders verbatim
    // (no inline parsing), so code keeps its symbols and spacing.
    if (FENCE.test(raw)) {
      const body: string[] = [];
      idx++;
      while (idx < lines.length && !FENCE.test(lines[idx])) body.push(lines[idx++]);
      out.push(
        <View key={key} style={styles.codeBlock}>
          <Text style={styles.codeBlockText}>{body.join('\n')}</Text>
        </View>,
      );
      continue; // idx sits on the closing fence; the loop's idx++ steps past it
    }

    const heading = raw.match(HEADING);
    if (heading) {
      const level = heading[1].length; // 1, 2 or 3
      const hStyle = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      out.push(
        <Text key={key} style={[base, hStyle]}>
          {parseInline(heading[2], key)}
        </Text>,
      );
      continue;
    }

    const quote = raw.match(QUOTE);
    if (quote) {
      out.push(
        <View key={key} style={styles.quoteRow}>
          <Text style={[base, styles.quoteText]}>{parseInline(quote[1], key)}</Text>
        </View>,
      );
      continue;
    }

    const ordered = raw.match(ORDERED);
    if (ordered) {
      out.push(
        <View key={key} style={styles.bulletRow}>
          <Text style={[base, styles.marker]}>{ordered[1]}.</Text>
          <Text style={[base, styles.bulletText]}>{parseInline(ordered[2], key)}</Text>
        </View>,
      );
      continue;
    }

    const bullet = raw.match(BULLET);
    if (bullet) {
      out.push(
        <View key={key} style={styles.bulletRow}>
          <Text style={[base, styles.marker]}>•</Text>
          <Text style={[base, styles.bulletText]}>{parseInline(bullet[1], key)}</Text>
        </View>,
      );
      continue;
    }

    if (raw.trim() === '') {
      out.push(<View key={key} style={styles.gap} />);
      continue;
    }
    out.push(
      <Text key={key} style={base}>
        {parseInline(raw, key)}
      </Text>,
    );
  }

  return <View style={styles.wrap}>{out}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 3 },
  line: { color: palette.primary, fontSize: 13, lineHeight: 19 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through', color: palette.faint },
  h1: { fontSize: 17, lineHeight: 23, fontWeight: '700', marginTop: 2 },
  h2: { fontSize: 15, lineHeight: 21, fontWeight: '700', marginTop: 2 },
  h3: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  marker: { lineHeight: 19, minWidth: 14 },
  bulletText: { flex: 1, minWidth: 0 },
  quoteRow: {
    borderLeftWidth: 3,
    borderLeftColor: surface.hairline,
    paddingLeft: 10,
    marginVertical: 1,
  },
  quoteText: { color: palette.secondary, fontStyle: 'italic' },
  code: {
    fontFamily: MONO,
    fontSize: 12.5,
    color: palette.primary,
    backgroundColor: withAlpha(palette.primary, 0.07),
  },
  codeBlock: {
    backgroundColor: withAlpha(palette.primary, 0.06),
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginVertical: 2,
  },
  codeBlockText: { fontFamily: MONO, fontSize: 12.5, lineHeight: 18, color: palette.primary },
  gap: { height: 7 },
});
