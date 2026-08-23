import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { bandRow } from '@/components/DayBand';
import { Text } from '@/components/ui/Text';
import type { ApiCommitment } from '@/lib/api';
import { peso } from '@/lib/money';
import { STAT_META, TAP_MIN, radius, surface, text } from '@/theme';

const TONE = STAT_META.WLT.color; // the wealth attribute's tone, as everywhere on this screen

function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return 'st';
  if (day % 10 === 2 && day !== 12) return 'nd';
  if (day % 10 === 3 && day !== 13) return 'rd';
  return 'th';
}

/**
 * A bill still owed this month — one tap logs the spend, never retyped.
 *
 * Shared with the ledger's back-date form, where the same bill is offered against an
 * earlier day. `action` is what the tap will do, because there it isn't "pay" but
 * "file the payment you already made"; `onRemove` is omitted there, since deleting a
 * standing bill is not something to reach while back-filling one day.
 */
export function BillRow({
  item,
  onPay,
  onRemove,
  action = 'tap to pay',
  spoken,
}: {
  item: ApiCommitment;
  onPay: () => void;
  onRemove?: () => void;
  action?: string;
  spoken?: string;
}) {
  const meta = [
    item.due_day > 0 ? `due the ${item.due_day}${ordinal(item.due_day)}` : null,
    item.variable ? 'varies' : null,
    action,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={bandRow.row}>
      <Pressable onPress={onPay} style={bandRow.main} accessibilityLabel={spoken ?? `Mark ${item.label} paid, ${peso(item.amount)}`}>
        <Ionicons name="ellipse-outline" size={17} color={TONE} />
        <View style={bandRow.text}>
          <Text style={bandRow.label} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={bandRow.meta}>{meta}</Text>
        </View>
        <Text style={bandRow.amount}>{peso(item.amount)}</Text>
      </Pressable>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.label}`} style={bandRow.remove}>
          <Text style={bandRow.removeGlyph}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The standing bills still owed this month, as one band of their own.
 *
 * Not a DayBand: a bill that hasn't been paid doesn't belong to a day yet, and
 * filing it under its due date would scatter what's owed across days that haven't
 * happened — the one thing the old flat list was careful never to hide.
 */
export function DueBills({
  due,
  total,
  onPay,
  onRemove,
}: {
  due: ApiCommitment[];
  total: number;
  onPay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (due.length === 0) return null;

  const count = due.length === 1 ? '1 bill' : `${due.length} bills`;
  return (
    <View style={styles.band}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Still to pay, ${count}, ${peso(total)}`}
      >
        <Text style={styles.title}>Still to pay</Text>
        <Text style={styles.meta}>{count}</Text>
        <View style={styles.spring} />
        <Text style={styles.total}>{peso(total)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={text.secondary} />
      </Pressable>
      {expanded ? (
        <View style={styles.body}>
          {due.map((item) => (
            <BillRow key={item.id} item={item} onPay={() => onPay(item.id)} onRemove={() => onRemove(item.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { borderRadius: radius.md, backgroundColor: surface.muted, paddingHorizontal: 14, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP_MIN },
  title: { color: text.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  meta: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  spring: { flex: 1 },
  total: { color: text.primary, fontSize: 14, fontWeight: '700' },
  body: { paddingBottom: 10 },
});
