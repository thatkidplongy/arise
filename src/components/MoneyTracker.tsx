import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { FoldToggle } from '@/components/FoldToggle';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiMoney, ApiMoneyEntry, MoneyScope } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { useShowMore } from '@/hooks/useShowMore';
import { peso } from '@/lib/money';
import { useMoneyHistory } from '@/query/useMoneyHistory';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text, withAlpha } from '@/theme';

const CHART_HALF = 30; // px each side of the baseline (earned up, spent down)
const SCOPES: MoneyScope[] = ['day', 'week', 'month'];
const SCOPE_LABEL: Record<MoneyScope, string> = { day: 'Day', week: 'Week', month: 'Month' };

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

/** How many logged lines show before the rest fold away. A month holds dozens, and
 * what this list is for is the recent handful you're checking. */
const VISIBLE_ENTRIES = 8;

/** One logged line: what it was, what it counted against, and how much. */
function EntryRow({ entry, today, showDay }: { entry: ApiMoneyEntry; today: string; showDay: boolean }) {
  const income = entry.direction === 'in';
  const meta = [
    showDay ? shortDay(entry.day, today) : null,
    entry.bucket,
    entry.commitment_id ? 'standing bill' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.entry}>
      <View style={styles.entryText}>
        <Text style={styles.entryNote} numberOfLines={1}>
          {entry.note}
        </Text>
        {meta ? <Text style={styles.entryMeta}>{meta}</Text> : null}
      </View>
      {/* The sign is what says which way the money went; the colour only agrees with
          it. All-red on a list that's mostly spending would just be noise. */}
      <Text style={[styles.entryAmount, income && { color: feedback.success }]}>
        {income ? '+' : '−'}
        {peso(entry.amount)}
      </Text>
    </View>
  );
}

/**
 * What the period's totals are actually made of. The chart says how much and when;
 * this is the only thing that says *what*, which is the question a day's spending
 * raises first.
 *
 * Ordered by the day the money moved, not the day it was typed in — a back-dated
 * spend belongs where it happened, otherwise catching up on a week would file
 * everything under the sitting that recorded it.
 */
function EntryList({ entries, today, showDay }: { entries: ApiMoneyEntry[]; today: string; showDay: boolean }) {
  const ordered = [...entries].sort(
    (a, b) => b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at),
  );
  const { shown, rest, folds, expanded, toggle } = useShowMore(ordered, VISIBLE_ENTRIES);

  return (
    <View style={styles.entries}>
      {shown.map((e) => (
        <EntryRow key={e.id} entry={e} today={today} showDay={showDay} />
      ))}
      {folds ? (
        <FoldToggle
          expanded={expanded}
          label={expanded ? 'Show fewer' : `${rest.length} more`}
          total={ordered.length}
          color={accent}
          onPress={toggle}
        />
      ) : null}
    </View>
  );
}

/**
 * A read-only picture of money over time: the headline balance from /state, a
 * Day/Week/Month period stepper, per-period totals, and a diverging bar chart
 * (earned above the line, spent below). Each period is fetched on demand from
 * /money/history, so browsing months of history stays fast. Logging and the
 * 50/30/20 plan live in the budget worksheet above — this is just the view.
 */
export function MoneyTracker({ money }: { money: ApiMoney }) {
  const resetMoney = useSystem((s) => s.resetMoney);
  const qc = useQueryClient();

  const today = dateKey();
  const [scope, setScope] = useState<MoneyScope>('week');
  const [anchor, setAnchor] = useState(today);
  const [confirmReset, setConfirmReset] = useState(false);

  const { history } = useMoneyHistory(scope, anchor);

  const chooseScope = (s: MoneyScope) => {
    setScope(s);
    setAnchor(today); // land on the current day/week/month
  };
  const step = (delta: number) =>
    setAnchor((a) => (scope === 'month' ? shiftMonth(a, delta) : shiftDay(a, scope === 'week' ? delta * 7 : delta)));
  const atLatest = history ? history.end >= today : anchor >= today;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['money-history'] });
  const reset = async () => {
    setConfirmReset(false);
    setAnchor(today);
    await resetMoney();
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
  // Whether anything was actually logged — not how many days the period spans. A day
  // period is always exactly one bucket, so counting buckets told the Day view it had
  // nothing to chart even with money logged, and told Week/Month it had something to
  // chart on a period where nothing happened.
  const charted = buckets.some((b) => b.earned > 0 || b.spent > 0);
  const entries = history?.entries ?? [];

  return (
    <SystemPanel title="Money">
      <View style={styles.balanceRow}>
        <View style={styles.balanceLeft}>
          <Text style={styles.balanceLabel}>Remaining</Text>
          {/* Start the log over — e.g. a new pay period. Guarded, since it can't be undone. */}
          <Pressable onPress={() => setConfirmReset(true)} hitSlop={6} accessibilityLabel="Reset money log">
            <Text style={styles.resetLink}>Reset</Text>
          </Pressable>
        </View>
        <Text style={[styles.balance, { color: money.balance < 0 ? feedback.danger : text.primary }]}>
          {peso(money.balance)}
        </Text>
      </View>

      <ConfirmModal
        visible={confirmReset}
        title="Reset money?"
        message="A full fresh start: your take-home salary, the 50/30/20 budget lines, and every logged in/out are all cleared, and the balance goes back to ₱0. This can’t be undone."
        confirmLabel="Reset"
        destructive
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />

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
        <Text style={[styles.total, styles.net]}>net {peso(history?.net ?? 0)}</Text>
      </View>

      {/* Diverging chart: earned above the line, spent below */}
      {charted ? (
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
      ) : (
        <Text style={styles.empty}>Not enough logged this period to chart yet.</Text>
      )}

      {/* The day is only worth repeating per row when the period spans more than one. */}
      {entries.length > 0 ? <EntryList entries={entries} today={today} showDay={scope !== 'day'} /> : null}
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
  balanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceLabel: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  resetLink: { color: text.faint, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
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
  empty: { color: text.faint, fontSize: 13, textAlign: 'center', marginTop: 12 },

  entries: { marginTop: 18, borderTopWidth: 1, borderTopColor: surface.hairline },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: surface.hairline,
  },
  entryText: { flex: 1, minWidth: 0 },
  entryNote: { color: text.primary, fontSize: 13 },
  // text.secondary, not text.faint: faint taupe is 2.46:1 on an ivory card, and this
  // line carries the day and the bucket.
  entryMeta: { color: text.secondary, fontSize: 11, marginTop: 1 },
  entryAmount: { color: text.primary, fontSize: 13, fontWeight: '700' },

});
