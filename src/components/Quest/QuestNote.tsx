import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Markdown } from '@/components/Markdown';
import { Text } from '@/components/ui/Text';
import { useCollapse } from '@/hooks/useCollapse';
import { snippet } from '@/lib/text';
import { ink, radius, typography } from '@/theme';

/** One written reflection on a quest. Short notes show inline; long or multi-line
 * ones (the glossaries some log-steps produce) fold to a one-line preview so they
 * don't swamp the window — tap the bar to unfold, tap the text to edit, × to remove. */
export function QuestNote({
  text: value,
  onEdit,
  onRemove,
}: {
  text: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const long = value.includes('\n') || value.length > 100;
  const { open, toggle } = useCollapse(long, long);

  if (!long) {
    return (
      <View style={styles.noteItem}>
        <Pressable style={styles.noteItemBody} onPress={onEdit}>
          <Markdown value={value} color={ink.text} />
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.noteX}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.noteItem, styles.noteItemCol]}>
      <View style={styles.noteBar}>
        <Pressable style={styles.noteBarTap} onPress={toggle} hitSlop={4}>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={ink.textDim} />
          <Text style={styles.notePreview} numberOfLines={1}>
            {open ? 'Your note' : snippet(value)}
          </Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.noteX}>×</Text>
        </Pressable>
      </View>
      {open ? (
        <Pressable onPress={onEdit}>
          <Markdown value={value} color={ink.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: ink.fill,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
    overflow: 'hidden', // clip any stray horizontal spill from a long note line
  },
  noteItemCol: { flexDirection: 'column', gap: 6 },
  noteItemBody: { flex: 1, minWidth: 0 },
  noteBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteBarTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notePreview: { ...typography.small, fontSize: 12, flex: 1, minWidth: 0, color: ink.textDim },
  noteX: { color: ink.textFaint, fontSize: 18, fontWeight: '700', marginTop: -2 },
});
