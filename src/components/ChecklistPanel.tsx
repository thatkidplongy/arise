import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { Box } from '@/components/ui/Check';
import { Field } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import { TAP_MIN, clay, surface, text, typography } from '@/theme';

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

/** A checkable list panel: tick items off (they stay, struck through, as a record),
 * × to delete, plus an add-a-line footer. Shared by the to-do and grocery lists —
 * each is a thin adapter that maps its rows into this shape and wires the actions. */
export function ChecklistPanel({
  title,
  sub,
  items,
  placeholder,
  emptyHint,
  maxLength = 200,
  onAdd,
  onToggle,
  onRemove,
}: {
  title: string;
  sub?: string;
  items: ChecklistItem[];
  placeholder: string;
  emptyHint?: string;
  maxLength?: number;
  onAdd: (text: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    onAdd(t);
  };

  return (
    <SystemPanel title={title} sub={sub}>
      {items.map((it) => (
        <View key={it.id} style={styles.row}>
          <Pressable
            onPress={() => onToggle(it.id, !it.checked)}
            hitSlop={6}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: it.checked }}
            style={styles.check}
          >
            <Box done={it.checked} size={24} />
            <Text style={[styles.label, it.checked && styles.labelDone]}>{it.label}</Text>
          </Pressable>
          <Pressable onPress={() => onRemove(it.id)} hitSlop={10} accessibilityLabel={`Remove ${it.label}`}>
            <Ionicons name="close" size={18} color={text.faint} />
          </Pressable>
        </View>
      ))}
      {items.length === 0 && emptyHint ? <Text style={styles.empty}>{emptyHint}</Text> : null}
      <View style={styles.add}>
        <Field
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          style={styles.input}
          placeholder={placeholder}
          maxLength={maxLength}
        />
        <Pressable
          onPress={add}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: clay[200] }]}
        >
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: TAP_MIN,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  label: { ...typography.body, flex: 1, color: text.primary },
  labelDone: { color: text.faint, textDecorationLine: 'line-through' },
  empty: { ...typography.body, color: text.secondary, paddingVertical: 4 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: { flex: 1 },
  addBtn: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: clay[500],
  },
  addText: { ...typography.button, color: clay[700] },
});
