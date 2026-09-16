import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { noteCount } from '@/lib/noteLimit';
import { feedback, text, typography } from '@/theme';

/** How much room is left in a note, shown only once it's worth knowing — see
 * `noteCount` for when that is and why the editors need it at all. */
export function NoteCounter({ length, max }: { length: number; max: number }) {
  const count = noteCount(length, max);
  if (!count.show) return null;
  return (
    <Text style={[styles.count, count.over ? styles.over : styles.near]}>{count.label}</Text>
  );
}

const styles = StyleSheet.create({
  count: { ...typography.small, fontSize: 11, marginTop: 6, textAlign: 'right' },
  near: { color: text.faint },
  over: { color: feedback.danger, fontWeight: '700' },
});
