import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useMotivation } from '@/store/useMotivation';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text, withAlpha } from '@/theme';

import { SystemPanel } from './SystemPanel';

/** Today's line — a deterministic daily pick from the server. Tapping shuffles to
 * another captured quote — no attribution, no navigation (Inspire is its own tab). */
export function DailyQuote({ initialText }: { initialText: string }) {
  const [line, setLine] = useState(initialText);
  useEffect(() => setLine(initialText), [initialText]);

  const shuffle = async () => {
    const { insights, loaded, fetch } = useMotivation.getState();
    let quotes = insights.flatMap((i) => i.quotes);
    if (!loaded) {
      await fetch(); // lazy-load the pool on first tap
      quotes = useMotivation.getState().insights.flatMap((i) => i.quotes);
    }
    const others = quotes.filter((q) => q !== line);
    if (others.length === 0) return;
    setLine(others[Math.floor(Math.random() * others.length)]);
  };

  return (
    <Pressable
      onPress={shuffle}
      style={({ pressed }) => [styles.quoteCard, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.quoteHead}>
        <Ionicons name="sparkles-outline" size={13} color={feedback.gold} />
        <Text style={styles.quoteLabel}>A LINE TO CARRY TODAY</Text>
      </View>
      <Text style={styles.quoteCardText}>“{line}”</Text>
      <Text style={styles.quoteHint}>tap for another</Text>
    </Pressable>
  );
}

/** A plain personal reminders list — jot a line, tap × to remove. */
export function Reminders({ items }: { items: { id: string; text: string }[] }) {
  const addReminder = useSystem((s) => s.addReminder);
  const removeReminder = useSystem((s) => s.removeReminder);
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    void addReminder(t);
  };

  return (
    <SystemPanel title="Reminders" sub={items.length ? String(items.length) : undefined}>
      {items.map((r) => (
        <View key={r.id} style={styles.reminderRow}>
          <Text style={styles.reminderText}>{r.text}</Text>
          <Pressable onPress={() => removeReminder(r.id)} hitSlop={8}>
            <Text style={styles.reminderX}>×</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.reminderAdd}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          style={styles.reminderInput}
          placeholder="Add a reminder…"
          placeholderTextColor={text.faint}
          maxLength={200}
        />
        <Pressable
          onPress={add}
          style={({ pressed }) => [styles.reminderAddBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.reminderAddText}>Add</Text>
        </Pressable>
      </View>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  quoteCard: {
    backgroundColor: withAlpha(feedback.gold, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(feedback.gold, 0.3),
    borderRadius: 11,
    padding: 14,
    gap: 8,
  },
  quoteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quoteLabel: {
    color: feedback.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  quoteCardText: {
    color: text.primary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  quoteHint: {
    color: text.faint,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  reminderText: { color: text.primary, fontSize: 13, lineHeight: 18, flex: 1 },
  reminderX: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
  reminderAdd: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  reminderInput: {
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
  reminderAddBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  reminderAddText: { color: accent, fontSize: 13, fontWeight: '700' },
});
