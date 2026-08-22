import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChecklistPanel } from '@/components/ChecklistPanel';
import { Card, Kicker } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { fetchInsights } from '@/query/useInsights';
import { useSystem } from '@/store/useSystem';
import { neutral, radius, sage, text, typography } from '@/theme';

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
    <Pressable onPress={shuffle} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      <Card tone="sage" style={styles.quoteCard}>
        <View pointerEvents="none" style={styles.quoteBlob} />
        <Kicker color={sage[700]}>A line to carry today</Kicker>
        <Text style={styles.quoteCardText}>“{line}”</Text>
        <Text style={styles.quoteHint}>tap for another</Text>
      </Card>
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
  pressed: { opacity: 0.85 },
  quoteCard: {
    gap: 9,
    overflow: 'hidden',
  },
  // The soft shape that keeps a quote from reading as a plain notice.
  quoteBlob: {
    position: 'absolute',
    left: -34,
    bottom: -46,
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: sage[200],
  },
  quoteCardText: {
    ...typography.numeral,
    fontSize: 19,
    lineHeight: 27,
    color: neutral[900],
  },
  quoteHint: {
    ...typography.small,
    color: text.secondary,
  },
});
