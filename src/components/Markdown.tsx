import { StyleSheet, Text, View } from 'react-native';

import { text as palette } from '@/theme';

/**
 * A deliberately tiny Markdown renderer — just the readable basics the journal
 * editor offers: **bold**, *italic* / _italic_, and `-`/`*` bullet lists, with
 * blank lines separating paragraphs. Not a full parser (no nesting, links, etc.);
 * anything it doesn't recognise renders as plain text, so nothing is ever lost.
 */

const BULLET = /^\s*[-*]\s+(.*)$/;
// One regex for both emphases; longest (bold) alternatives come first so **x**
// isn't mistaken for two italics.
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

function parseInline(line: string, keyBase: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(
        <Text key={`${keyBase}-b${i}`} style={styles.bold}>
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

  return (
    <View style={styles.wrap}>
      {lines.map((raw, idx) => {
        const bullet = raw.match(BULLET);
        if (bullet) {
          return (
            <View key={idx} style={styles.bulletRow}>
              <Text style={[base, styles.bulletDot]}>•</Text>
              <Text style={[base, styles.bulletText]}>{parseInline(bullet[1], `l${idx}`)}</Text>
            </View>
          );
        }
        if (raw.trim() === '') return <View key={idx} style={styles.gap} />;
        return (
          <Text key={idx} style={base}>
            {parseInline(raw, `l${idx}`)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 3 },
  line: { color: palette.primary, fontSize: 13, lineHeight: 19 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  bulletRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  bulletDot: { lineHeight: 19 },
  bulletText: { flex: 1 },
  gap: { height: 7 },
});
