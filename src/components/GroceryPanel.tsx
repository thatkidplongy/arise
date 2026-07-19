import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text } from '@/theme';

/** A plain grocery list — add what you need, tick it off once it's in the basket.
 * Bought items stay (struck through) as a record; × removes for good. */
export function GroceryPanel() {
  const items = useSystem((s) => s.state?.grocery ?? []);
  const addGrocery = useSystem((s) => s.addGrocery);
  const toggleGrocery = useSystem((s) => s.toggleGrocery);
  const removeGrocery = useSystem((s) => s.removeGrocery);
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    void addGrocery(t);
  };

  const toBuy = items.filter((g) => !g.bought).length;

  return (
    <SystemPanel title="Grocery list" sub={items.length ? `${toBuy} to buy` : undefined}>
      {items.map((g) => (
        <View key={g.id} style={styles.row}>
          <Pressable
            onPress={() => toggleGrocery(g.id, !g.bought)}
            hitSlop={6}
            style={styles.check}
          >
            <Ionicons
              name={g.bought ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={g.bought ? feedback.success : text.faint}
            />
            <Text style={[styles.name, g.bought && styles.nameBought]}>{g.name}</Text>
          </Pressable>
          <Pressable onPress={() => removeGrocery(g.id)} hitSlop={8}>
            <Text style={styles.remove}>×</Text>
          </Pressable>
        </View>
      ))}
      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing on the list yet. Add what you need to buy.</Text>
      ) : null}
      <View style={styles.add}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          style={styles.input}
          placeholder="Add an item…"
          placeholderTextColor={text.faint}
          maxLength={120}
        />
        <Pressable
          onPress={add}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
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
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  name: { color: text.primary, fontSize: 13, lineHeight: 18, flex: 1 },
  nameBought: { color: text.faint, textDecorationLine: 'line-through' },
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
