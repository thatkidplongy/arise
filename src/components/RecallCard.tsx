import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiRecall } from '@/lib/api';
import { STAT_META, text, withAlpha } from '@/theme';

/** Recall borrows Grow's colour — this is the reading attribute coming back around. */
const HUE = STAT_META.INT.color;

function ago(days: number): string {
  if (days <= 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * Something you learned a while back, coming back as a question. The first tap
 * reveals the answer, the next moves on.
 *
 * The question comes first on purpose: a few seconds of trying and not quite
 * getting there is what strengthens the memory, and an answer shown straight away
 * removes that. Highlights distilled before cues existed have none, and simply
 * show their text rather than being asked something invented after the fact.
 */
export function RecallCard({ items }: { items: ApiRecall[] }) {
  // Reset to the server's first pick whenever the set changes, the "adjust state
  // during render" way (no effect); tapping still moves `at` in between.
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [seed, setSeed] = useState(items[0]?.id ?? '');
  const head = items[0]?.id ?? '';
  if (seed !== head) {
    setSeed(head);
    setAt(0);
    setShown(false);
  }

  if (!items.length) return null;
  const item = items[at % items.length];
  const asks = Boolean(item.cue) && !shown;

  const advance = () => {
    if (item.cue && !shown) {
      setShown(true);
      return;
    }
    setAt((i) => i + 1);
    setShown(false);
  };

  return (
    <Pressable
      onPress={advance}
      disabled={items.length < 2 && !item.cue}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.head}>
        <Ionicons name="bulb-outline" size={13} color={HUE} />
        <Text style={styles.label}>{asks ? 'TRY TO RECALL' : 'REMEMBER THIS?'}</Text>
      </View>
      <Text style={styles.body}>{asks ? item.cue : item.text}</Text>
      {!asks && item.hook ? <Text style={styles.hook}>{item.hook}</Text> : null}
      <Text style={styles.meta}>
        {ago(item.days_ago)}
        {item.source_label ? ` · ${item.source_label}` : ''}
        {asks ? '  ·  answer it, then tap' : items.length > 1 ? '  ·  tap for another' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: withAlpha(HUE, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(HUE, 0.3),
    borderRadius: 11,
    padding: 14,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: HUE, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  body: { color: text.primary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  hook: { color: text.secondary, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  meta: { color: text.faint, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});
