import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { accent, feedback, surface, text } from '@/theme';

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
          <Pressable onPress={() => onToggle(it.id, !it.checked)} hitSlop={6} style={styles.check}>
            <Ionicons
              name={it.checked ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={it.checked ? feedback.success : text.faint}
            />
            <Text style={[styles.label, it.checked && styles.labelDone]}>{it.label}</Text>
          </Pressable>
          <Pressable onPress={() => onRemove(it.id)} hitSlop={8}>
            <Text style={styles.remove}>×</Text>
          </Pressable>
        </View>
      ))}
      {items.length === 0 && emptyHint ? <Text style={styles.empty}>{emptyHint}</Text> : null}
      <View style={styles.add}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={text.faint}
          maxLength={maxLength}
        />
        <Pressable onPress={add} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
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
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  label: { color: text.primary, fontSize: 13, lineHeight: 18, flex: 1 },
  labelDone: { color: text.faint, textDecorationLine: 'line-through' },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 19, paddingVertical: 4 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    backgroundColor: surface.base,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  addText: { color: accent, fontSize: 13, fontWeight: '700' },
});
