import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { shared } from '@/components/Inspire/shared';
import { Text } from '@/components/ui/Text';
import type { ApiInsight } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { accent, clay, feedback, press, radius, surface, text, typography } from '@/theme';

/** The footer shared by both card kinds: open the original, or remove it. */
export function CardActions({
  sourceUrl,
  id,
  onRemove,
}: {
  sourceUrl: string;
  id: string;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.actions}>
      {sourceUrl ? (
        <Pressable
          onPress={() => Linking.openURL(sourceUrl).catch(() => {})}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: press.strong }]}
          hitSlop={6}
        >
          <Ionicons name="open-outline" size={14} color={text.secondary} />
          <Text style={styles.actionText}>Open original</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onRemove(id)}
        style={({ pressed }) => [styles.actionBtn, pressed && { opacity: press.strong }]}
        hitSlop={6}
      >
        <Ionicons name="trash-outline" size={14} color={feedback.danger} />
        <Text style={[styles.actionText, { color: feedback.danger }]}>Remove</Text>
      </Pressable>
    </View>
  );
}

export function InsightCard({
  insight,
  expanded,
  onToggle,
  onRemove,
}: {
  insight: ApiInsight;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const saveNorthStar = useSystem((s) => s.saveNorthStar);
  const [justSet, setJustSet] = useState<string | null>(null);

  const setAsNorthStar = async (quote: string) => {
    setJustSet(quote);
    await saveNorthStar(quote);
    setTimeout(() => setJustSet((q) => (q === quote ? null : q)), 2000);
  };

  const label = insight.summary || insight.quotes[0] || 'Captured video';

  return (
    <View style={shared.card}>
      <Pressable style={styles.rowHead} onPress={onToggle} hitSlop={4}>
        <Text style={styles.rowSummary} numberOfLines={expanded ? undefined : 2}>
          {label}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.takeaways.length > 0 ? (
            <View style={styles.takeaways}>
              <Text style={styles.sectionLabel}>TAKEAWAYS</Text>
              {insight.takeaways.map((t, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {insight.quotes.map((q, i) => (
            <View key={i} style={styles.quote}>
              <Text style={styles.quoteText}>“{q}”</Text>
              <Pressable
                onPress={() => setAsNorthStar(q)}
                style={({ pressed }) => [styles.starBtn, pressed && { opacity: press.medium }]}
                hitSlop={6}
              >
                <Ionicons
                  name={justSet === q ? 'checkmark-circle' : 'compass-outline'}
                  size={13}
                  color={justSet === q ? feedback.success : accent}
                />
                <Text style={[styles.starText, justSet === q && { color: feedback.success }]}>
                  {justSet === q ? 'Set as North Star' : 'Make this my North Star'}
                </Text>
              </Pressable>
            </View>
          ))}

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove} />
        </>
      ) : null}
    </View>
  );
}

/** A captured how-to video: its summary (the header) + takeaways — the kept
 * information — each of which can also drop straight into your to-do list.
 * Collapsible like InsightCard, but no quotes / North Star. */
export function TipsCard({
  insight,
  expanded,
  onToggle,
  onRemove,
}: {
  insight: ApiInsight;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const addReminder = useSystem((s) => s.addReminder);
  const [added, setAdded] = useState<number[]>([]);

  const sendToTodo = (step: string, i: number) => {
    if (added.includes(i)) return;
    setAdded((xs) => [...xs, i]);
    void addReminder(step);
  };

  const label = insight.summary || insight.takeaways[0] || 'Captured tips';

  return (
    <View style={shared.card}>
      <Pressable style={styles.rowHead} onPress={onToggle} hitSlop={4}>
        <Ionicons name="bulb-outline" size={16} color={feedback.gold} />
        <Text style={styles.rowSummary} numberOfLines={expanded ? undefined : 2}>
          {label}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.takeaways.length === 0 && insight.steps.length === 0 ? (
            <Text style={shared.empty}>Nothing came out of this one.</Text>
          ) : null}

          {/* The kept knowledge — the important part, just to read. */}
          {insight.takeaways.length > 0 ? (
            <View style={styles.takeaways}>
              <Text style={styles.sectionLabel}>TAKEAWAYS</Text>
              {insight.takeaways.map((t, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Optional concrete actions — each can drop into your to-do list. */}
          {insight.steps.length > 0 ? (
            <View style={styles.tips}>
              <Text style={styles.sectionLabel}>STEPS TO TRY</Text>
              {insight.steps.map((step, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipText}>{step}</Text>
                  <Pressable
                    onPress={() => sendToTodo(step, i)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.todoBtn, pressed && { opacity: press.medium }]}
                  >
                    <Ionicons
                      name={added.includes(i) ? 'checkmark-circle' : 'add-circle-outline'}
                      size={14}
                      color={added.includes(i) ? feedback.success : accent}
                    />
                    <Text style={[styles.todoText, added.includes(i) && { color: feedback.success }]}>
                      {added.includes(i) ? 'Added' : 'To-do'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove} />
        </>
      ) : null}
    </View>
  );
}

/** The Inspire tab body: paste a video link, keep its distilled wisdom, and let a
 * quote resurface on Status. Captures run in the background (see useCaptures).
 * The library collapses to slim, tappable rows with a search filter so it stays
 * scannable at any size. Standalone — never touches XP.
 *
 * A link that didn't distil isn't dropped: the server keeps it, and FailedCaptures
 * sits between the capture card and the library so it's the first thing you see —
 * a shelf of things to try again, not an error you already missed. */

const styles = StyleSheet.create({
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowSummary: { ...typography.numeral, flex: 1, fontSize: 17, lineHeight: 23 },
  takeaways: { gap: 6 },
  sectionLabel: { ...typography.kicker, color: text.secondary },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { color: accent, fontSize: 14, lineHeight: 20 },
  bulletText: { ...typography.body, lineHeight: 21, flex: 1 },
  quote: {
    backgroundColor: clay[100],
    borderRadius: radius.md,
    padding: 16,
    gap: 10,
  },
  quoteText: { ...typography.numeral, fontSize: 18, lineHeight: 26, color: clay[800] },
  starBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  starText: { color: accent, fontSize: 12, fontWeight: '600' },
  tips: { gap: 8 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: surface.muted,
    borderRadius: radius.md,
    padding: 13,
  },
  tipText: { ...typography.body, flex: 1 },
  todoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  todoText: { color: accent, fontSize: 12, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
});
