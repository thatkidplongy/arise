import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { useCollapse } from '@/hooks/useCollapse';
import type { ApiMoney } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { num } from '@/lib/num';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, onAccent, surface, text, withAlpha } from '@/theme';

/** Peso amount, no trailing .00 when whole. */
function peso(n: number): string {
  return `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * The money log on the You tab — where the wealth daily's "log today's spending"
 * actually lands. Log an amount in (income) or out (spending) with a short note;
 * the card shows this week's in/out (and today's) and keeps a dated, removable
 * list. Totals are server-derived per the current ISO week.
 */
export function MoneyTracker({ money }: { money: ApiMoney }) {
  const addMoney = useSystem((s) => s.addMoney);
  const removeMoney = useSystem((s) => s.removeMoney);

  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const today = dateKey();
  const { open, toggle } = useCollapse(money.entries.length > 0, true);

  const submit = () => {
    const value = num(amount);
    if (value <= 0) return;
    void addMoney(value, direction, note.trim());
    setAmount('');
    setNote('');
  };

  return (
    <SystemPanel title="Money" sub={money.entries.length ? `${money.entries.length} logged` : undefined}>
      <View style={styles.totals}>
        <View style={styles.totalCell}>
          <Text style={[styles.totalNum, { color: feedback.success }]}>{peso(money.week_in)}</Text>
          <Text style={styles.totalLabel}>in this week</Text>
        </View>
        <View style={styles.totalCell}>
          <Text style={[styles.totalNum, { color: feedback.danger }]}>{peso(money.week_out)}</Text>
          <Text style={styles.totalLabel}>out this week</Text>
        </View>
      </View>
      <Text style={styles.today}>
        Today: <Text style={{ color: feedback.success }}>{peso(money.today_in)}</Text> in ·{' '}
        <Text style={{ color: feedback.danger }}>{peso(money.today_out)}</Text> out
      </Text>

      <View style={styles.dirRow}>
        {(['out', 'in'] as const).map((d) => {
          const on = direction === d;
          const color = d === 'in' ? feedback.success : feedback.danger;
          return (
            <Pressable
              key={d}
              onPress={() => setDirection(d)}
              style={[styles.dirBtn, on && { backgroundColor: withAlpha(color, 0.14), borderColor: color }]}
            >
              <Text style={[styles.dirText, on && { color }]}>{d === 'in' ? 'Money in' : 'Money out'}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.addRow}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="₱ amount"
          placeholderTextColor={text.faint}
          keyboardType="numeric"
          style={[styles.input, styles.amount]}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="note (optional)"
          placeholderTextColor={text.faint}
          style={[styles.input, styles.note]}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <Pressable
          onPress={submit}
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Log amount"
        >
          <Ionicons name="add" size={20} color={onAccent} />
        </Pressable>
      </View>

      {money.entries.length > 0 ? (
        <>
          <Pressable onPress={toggle} style={styles.logHead} accessibilityRole="button">
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={text.faint} />
            <Text style={styles.logHeadText}>Recent</Text>
          </Pressable>
          {open
            ? money.entries.map((e) => {
                const color = e.direction === 'in' ? feedback.success : feedback.danger;
                return (
                  <View key={e.id} style={styles.entry}>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <Text style={styles.entryNote} numberOfLines={1}>
                      {e.note || (e.direction === 'in' ? 'Money in' : 'Spending')}
                    </Text>
                    <Text style={styles.entryDay}>{shortDay(e.day, today)}</Text>
                    <Text style={[styles.entryAmount, { color }]}>
                      {e.direction === 'in' ? '+' : '−'}
                      {peso(e.amount)}
                    </Text>
                    <Pressable onPress={() => void removeMoney(e.id)} hitSlop={8} accessibilityLabel="Remove">
                      <Text style={styles.remove}>×</Text>
                    </Pressable>
                  </View>
                );
              })
            : null}
        </>
      ) : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  totals: { flexDirection: 'row', gap: 12 },
  totalCell: { flex: 1 },
  totalNum: { fontSize: 20, fontWeight: '700' },
  totalLabel: { color: text.faint, fontSize: 11, marginTop: 1 },
  today: { color: text.secondary, fontSize: 12, marginTop: 8 },
  dirRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  dirBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 8,
  },
  dirText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: text.primary,
    fontSize: 14,
    backgroundColor: surface.card,
  },
  amount: { width: 96 },
  note: { flex: 1 },
  add: {
    width: 40,
    height: 40,
    borderRadius: 9,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  logHeadText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  entryNote: { flex: 1, color: text.secondary, fontSize: 13 },
  entryDay: { color: text.faint, fontSize: 11 },
  entryAmount: { fontSize: 13, fontWeight: '700' },
  remove: { color: text.faint, fontSize: 18, fontWeight: '700', marginTop: -2 },
});
