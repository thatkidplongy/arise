import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import type { ApiMoney, MoneyScope } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { num } from '@/lib/num';
import { useMoneyHistory } from '@/query/useMoneyHistory';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, onAccent, surface, text, withAlpha } from '@/theme';

const CHART_HALF = 30; // px each side of the baseline (earned up, spent down)
const SCOPES: MoneyScope[] = ['day', 'week', 'month'];
const SCOPE_LABEL: Record<MoneyScope, string> = { day: 'Day', week: 'Week', month: 'Month' };

function peso(n: number): string {
  return `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + delta));
}
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1 + delta, 1));
}
/** "Jul 14" for a 'YYYY-MM-DD'. */
function monthDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function weekdayNarrow(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
}

/**
 * The money log on its own screen. A headline balance from /state, a Day/Week/
 * Month period stepper, a diverging bar chart (earned up, spent down) and the
 * period's entries — each period fetched on demand from /money/history, so
 * browsing months of history stays fast and /state never carries the whole log.
 */
export function MoneyTracker({ money }: { money: ApiMoney }) {
  const addMoney = useSystem((s) => s.addMoney);
  const removeMoney = useSystem((s) => s.removeMoney);
  const qc = useQueryClient();

  const today = dateKey();
  const [scope, setScope] = useState<MoneyScope>('week');
  const [anchor, setAnchor] = useState(today);
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const { history, loading } = useMoneyHistory(scope, anchor);

  const chooseScope = (s: MoneyScope) => {
    setScope(s);
    setAnchor(today); // land on the current day/week/month
  };
  const step = (delta: number) =>
    setAnchor((a) => (scope === 'month' ? shiftMonth(a, delta) : shiftDay(a, scope === 'week' ? delta * 7 : delta)));
  const atLatest = history ? history.end >= today : anchor >= today;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['money-history'] });
  const submit = async () => {
    const value = num(amount);
    if (value <= 0) return;
    setAmount('');
    setNote('');
    setAnchor(today); // jump to where the entry lands
    await addMoney(value, direction, note.trim());
    refresh();
  };
  const remove = async (id: string) => {
    await removeMoney(id);
    refresh();
  };

  const periodLabel =
    scope === 'day'
      ? shortDay(anchor, today)
      : scope === 'month'
        ? (() => {
            const [y, m] = anchor.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
          })()
        : history
          ? `${monthDay(history.start)} – ${monthDay(history.end)}`
          : 'This week';

  const buckets = history?.buckets ?? [];
  const chartMax = Math.max(1, ...buckets.map((b) => Math.max(b.earned, b.spent)));
  const barH = (v: number) => (v > 0 ? Math.max(3, Math.round((v / chartMax) * CHART_HALF)) : 0);
  const showLabels = buckets.length <= 7;

  return (
    <SystemPanel title="Money">
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>Remaining</Text>
        <Text style={[styles.balance, { color: money.balance < 0 ? feedback.danger : text.primary }]}>
          {peso(money.balance)}
        </Text>
      </View>

      {/* Period scope */}
      <View style={styles.scopeRow}>
        {SCOPES.map((s) => {
          const on = scope === s;
          return (
            <Pressable key={s} onPress={() => chooseScope(s)} style={[styles.scopeBtn, on && styles.scopeOn]}>
              <Text style={[styles.scopeText, on && styles.scopeTextOn]}>{SCOPE_LABEL[s]}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Period navigator */}
      <View style={styles.nav}>
        <Pressable onPress={() => step(-1)} hitSlop={8} accessibilityLabel="Previous">
          <Ionicons name="chevron-back" size={18} color={accent} />
        </Pressable>
        <Pressable onPress={() => setAnchor(today)} hitSlop={6}>
          <Text style={styles.navLabel}>{periodLabel}</Text>
        </Pressable>
        <Pressable onPress={() => !atLatest && step(1)} hitSlop={8} disabled={atLatest} accessibilityLabel="Next">
          <Ionicons name="chevron-forward" size={18} color={atLatest ? text.faint : accent} />
        </Pressable>
      </View>

      {/* Earned / spent / net for the period */}
      <View style={styles.totals}>
        <Text style={[styles.total, { color: feedback.success }]}>{peso(history?.earned ?? 0)} in</Text>
        <Text style={[styles.total, { color: feedback.danger }]}>{peso(history?.spent ?? 0)} out</Text>
        <Text style={[styles.total, styles.net]}>
          net {history && history.net < 0 ? '−' : ''}
          {peso(Math.abs(history?.net ?? 0))}
        </Text>
      </View>

      {/* Diverging chart: earned above the line, spent below */}
      {buckets.length > 1 ? (
        <View style={styles.chartWrap}>
          <View style={styles.baseline} />
          <View style={styles.chart}>
            {buckets.map((b) => (
              <View key={b.day} style={styles.col}>
                <View style={styles.half}>
                  {b.earned > 0 ? (
                    <View style={[styles.bar, styles.barUp, { height: barH(b.earned), backgroundColor: feedback.success }]} />
                  ) : null}
                </View>
                <View style={[styles.half, styles.halfBottom]}>
                  {b.spent > 0 ? (
                    <View style={[styles.bar, styles.barDown, { height: barH(b.spent), backgroundColor: feedback.danger }]} />
                  ) : null}
                </View>
                {showLabels ? <Text style={styles.colLabel}>{weekdayNarrow(b.day)}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Add */}
      <View style={styles.dirRow}>
        {(['out', 'in'] as const).map((dir) => {
          const on = direction === dir;
          const color = dir === 'in' ? feedback.success : feedback.danger;
          return (
            <Pressable
              key={dir}
              onPress={() => setDirection(dir)}
              style={[styles.dirBtn, on && { backgroundColor: withAlpha(color, 0.14), borderColor: color }]}
            >
              <Text style={[styles.dirText, on && { color }]}>{dir === 'in' ? 'Money in' : 'Money out'}</Text>
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
        <Pressable onPress={submit} style={({ pressed }) => [styles.add, pressed && { opacity: 0.85 }]} accessibilityLabel="Log amount">
          <Ionicons name="add" size={20} color={onAccent} />
        </Pressable>
      </View>

      {/* Period entries */}
      {history && history.entries.length === 0 ? (
        <Text style={styles.empty}>{loading ? 'Loading…' : 'Nothing logged this period.'}</Text>
      ) : (
        (history?.entries ?? []).map((e) => {
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
              <Pressable onPress={() => void remove(e.id)} hitSlop={8} accessibilityLabel="Remove">
                <Text style={styles.remove}>×</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: surface.hairline,
  },
  balanceLabel: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  balance: { fontSize: 26, fontWeight: '800' },
  scopeRow: { flexDirection: 'row', gap: 6 },
  scopeBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 7,
  },
  scopeOn: { borderColor: accent, backgroundColor: withAlpha(accent, 0.1) },
  scopeText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  scopeTextOn: { color: accent },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 },
  navLabel: { color: text.primary, fontSize: 14, fontWeight: '700', minWidth: 130, textAlign: 'center' },
  totals: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  total: { fontSize: 12, fontWeight: '700' },
  net: { color: text.secondary },
  chartWrap: { marginTop: 12, height: CHART_HALF * 2 + 16, justifyContent: 'center' },
  baseline: { position: 'absolute', left: 0, right: 0, top: CHART_HALF, height: 1, backgroundColor: surface.hairline },
  chart: { flexDirection: 'row', alignItems: 'stretch', gap: 3, height: CHART_HALF * 2 },
  col: { flex: 1, flexDirection: 'column' },
  half: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  halfBottom: { justifyContent: 'flex-start' },
  bar: { width: '70%', minWidth: 3 },
  barUp: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barDown: { borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  colLabel: {
    position: 'absolute',
    bottom: -16,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: text.faint,
    fontSize: 10,
  },
  dirRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
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
  empty: { color: text.faint, fontSize: 13, textAlign: 'center', marginTop: 12 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  entryNote: { flex: 1, minWidth: 0, color: text.secondary, fontSize: 13 },
  entryDay: { color: text.faint, fontSize: 11 },
  entryAmount: { fontSize: 13, fontWeight: '700' },
  remove: { color: text.faint, fontSize: 18, fontWeight: '700', marginTop: -2 },
});
