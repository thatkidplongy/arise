import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChecklistPanel } from '@/components/ChecklistPanel';
import { fetchInsights } from '@/query/useInsights';
import { useSystem } from '@/store/useSystem';
import { feedback, text, withAlpha } from '@/theme';

/** Today's line — a deterministic daily pick from the server. Tapping shuffles to
 * another captured quote — no attribution, no navigation (Inspire is its own tab). */
export function DailyQuote({ initialText }: { initialText: string }) {
  // Reset to the server's daily pick whenever it changes, the "adjust state during
  // render" way (no effect); shuffle can still swap `line` in between.
  const [line, setLine] = useState(initialText);
  const [seed, setSeed] = useState(initialText);
  if (seed !== initialText) {
    setSeed(initialText);
    setLine(initialText);
  }

  const shuffle = async () => {
    const insights = await fetchInsights(); // cached, or lazy-loaded on first tap
    const quotes = insights.flatMap((i) => i.quotes);
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

/** A checkable to-do list — only what's still open. Ticking an item moves it to the
 * You tab's Completed record (where it can be undone), so it leaves this list. */
export function Reminders({ items }: { items: { id: string; text: string; done: boolean }[] }) {
  const addReminder = useSystem((s) => s.addReminder);
  const toggleReminder = useSystem((s) => s.toggleReminder);
  const removeReminder = useSystem((s) => s.removeReminder);
  const open = items.filter((r) => !r.done);

  return (
    <ChecklistPanel
      title="To-do"
      sub={open.length ? `${open.length} left` : undefined}
      items={open.map((r) => ({ id: r.id, label: r.text, checked: false }))}
      placeholder="Add a to-do…"
      emptyHint="Nothing to do right now. Add a line, or enjoy the clear list."
      onAdd={(t) => void addReminder(t)}
      onToggle={(id, done) => void toggleReminder(id, done)}
      onRemove={(id) => void removeReminder(id)}
    />
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
});
