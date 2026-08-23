import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { formatDayBand } from '@/lib/dates';
import { TAP_MIN, radius, sage, surface, text, typography } from '@/theme';

/**
 * One calendar day as a collapsible band: a header that always carries the day's
 * headline figure, over rows that fold away so a month of history stays one screen
 * tall. Today is tinted, because it's the band every one of these lists opens on.
 *
 * Shared by the money ledger and the to-do list — the figure differs (pesos there,
 * a count here) so it's the caller's string, but the chrome, the tint and what a
 * screen reader hears are one thing in one place.
 */
export function DayBand({
  day,
  today,
  meta,
  trailing,
  expanded,
  onToggle,
  children,
}: {
  /** 'YYYY-MM-DD' — the band's own day. */
  day: string;
  /** 'YYYY-MM-DD' — what counts as today, for the label and the tint. */
  today: string;
  /** The quiet middle line: what the band is holding. Omitted when the trailing
   * figure already says it. */
  meta?: string;
  /** The band's headline figure, always visible. */
  trailing: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const label = formatDayBand(day, today);
  const spoken = [label, meta, trailing].filter(Boolean).join(', ');
  return (
    <View style={[styles.band, day === today && styles.bandToday]}>
      <Pressable
        onPress={onToggle}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={spoken}
      >
        <Text style={styles.title}>{label}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        <View style={styles.spring} />
        <Text style={styles.trailing}>{trailing}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={text.secondary} />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    borderRadius: radius.md,
    backgroundColor: surface.muted,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  bandToday: { backgroundColor: sage[100] },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP_MIN },
  title: {
    color: text.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  meta: { color: text.secondary, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  spring: { flex: 1 },
  trailing: { color: text.primary, fontSize: 14, fontWeight: '700' },
  body: { paddingBottom: 10 },
});

/** The hairline-separated row a band's body is made of — one entry, one to-do. */
export const bandRow = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: TAP_MIN },
  text: { flex: 1, minWidth: 0 },
  label: { color: text.primary, fontSize: 13 },
  meta: { color: text.secondary, fontSize: 11, marginTop: 1 },
  amount: { color: text.primary, fontSize: 13, fontWeight: '700' },
  remove: { minWidth: 24, minHeight: TAP_MIN, alignItems: 'flex-end', justifyContent: 'center' },
  removeGlyph: { color: text.secondary, fontSize: 18, fontWeight: '700' },
  done: { color: text.faint, textDecorationLine: 'line-through' },
  empty: { ...typography.body, color: text.secondary, paddingTop: 10, fontSize: 12.5 },
});
