import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BucketLedger } from '@/components/BucketLedger';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { Text, TextInput } from '@/components/ui/Text';
import type { ApiBudget } from '@/lib/api';
import { dateKey } from '@/lib/dates';
import {
  BUCKET_LABEL,
  BUDGET_SPLIT,
  describeBucket,
  describeDaily,
  readBudget,
  summariseBudget,
  type BucketReading,
  type DailyLine,
} from '@/lib/budget';
import { peso } from '@/lib/money';
import { hasLoggedPayday, PAYDAY_NOTE } from '@/lib/moneyEntry';
import { num } from '@/lib/num';
import { useMoneyHistory } from '@/query/useMoneyHistory';
import { useSystem } from '@/store/useSystem';
import { STAT_META, feedback, radius, surface, text, typography, withAlpha } from '@/theme';

const TONE = STAT_META.WLT.color; // the wealth attribute's tone, for this whole area
const EDITABLE: ('needs' | 'wants')[] = ['needs', 'wants'];

/** WCAG 2.5.5 — anything tappable clears 44pt. */
const TAP = 44;

/**
 * Being over the line is only worth flagging on needs and wants. On savings it's
 * the good outcome, so it reads sage rather than brick.
 *
 * `feedback.gold` is deliberately absent from this set: at 2.43:1 on an ivory card
 * it fails even the 3:1 floor for non-text, so it can't be trusted to carry
 * meaning. Colour here only ever *reinforces* the words in describeBucket().
 */
function colorFor(reading: BucketReading): string {
  if (reading.standing === 'on') return feedback.success;
  if (reading.bucket === 'savings') return reading.standing === 'over' ? feedback.success : feedback.danger;
  return reading.standing === 'over' ? feedback.danger : TONE;
}

/**
 * The day-sized line, under the month-sized one.
 *
 * The monthly bar answers "am I inside the rule this month", which stops being
 * actionable the moment it's breached — nothing can be done about it for another
 * three weeks. This one starts at zero every morning, so a heavy Tuesday costs
 * Tuesday and nothing more.
 */
function DailyRow({ line }: { line: DailyLine }) {
  const color = line.left < 0 ? feedback.danger : TONE;

  // Nothing to spend means nothing to draw: a ₱0 of ₱0 row and an empty bar say
  // less than the sentence does, and read as a bug rather than a fact.
  if (line.committed) {
    return (
      <View style={styles.daily}>
        <Text style={styles.dailyLabel}>Today</Text>
        <Text style={styles.bucketActual}>{describeDaily(line, peso)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.daily}>
      <View style={styles.bucketHead}>
        <Text style={styles.dailyLabel}>Today</Text>
        <Text style={styles.dailyAmount}>
          <Text style={{ color }}>{peso(line.spent)}</Text>
          <Text style={styles.bucketTarget}> / {peso(line.allowance)}</Text>
        </Text>
      </View>
      <XpBar value={line.spent} max={Math.max(line.allowance, line.spent, 1)} color={color} height={4} />
      <Text style={[styles.bucketActual, { color }]}>{describeDaily(line, peso)}</Text>
    </View>
  );
}

function BucketRow({ reading, daily }: { reading: BucketReading; daily?: DailyLine }) {
  const color = colorFor(reading);
  const spentLabel = reading.bucket === 'savings' ? 'kept so far' : 'spent so far';
  return (
    <View style={styles.bucket}>
      <View style={styles.bucketHead}>
        <Text style={styles.bucketName}>{BUCKET_LABEL[reading.bucket]}</Text>
        <Text style={styles.bucketAmount}>
          <Text style={{ color }}>{peso(reading.planned)}</Text>
          <Text style={styles.bucketTarget}> / {peso(reading.target)}</Text>
        </Text>
      </View>
      <XpBar value={reading.planned} max={reading.target} color={color} height={6} />
      <View style={styles.bucketFoot}>
        {/* The words, not the colour, are what say which side of the line this is. */}
        <Text style={[styles.bucketStanding, { color }]}>{describeBucket(reading, peso)}</Text>
        <Text style={styles.bucketShare}>{Math.round(reading.share * 100)}%</Text>
      </View>
      {/* Plan against reality. The bar tracks the plan; this line is what's real. */}
      <Text style={styles.bucketActual}>
        {peso(reading.actual)} {spentLabel}
      </Text>
      {daily ? <DailyRow line={daily} /> : null}
    </View>
  );
}

/** The stored payday amount — only a setting, never money. Money exists once a
 * payday is actually logged in (the button below the field). */
function IncomeField({ payday }: { payday: number }) {
  const setIncome = useSystem((s) => s.setIncome);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const save = async () => {
    const value = num(draft);
    setEditing(false);
    if (value > 0 && value !== payday) await setIncome(value);
  };

  if (!editing) {
    return (
      <Pressable
        onPress={() => {
          setDraft(payday > 0 ? String(payday) : '');
          setEditing(true);
        }}
        style={styles.incomeRow}
        accessibilityLabel="Edit take-home pay per payday"
      >
        <Text style={styles.incomeLabel}>Take-home per payday</Text>
        <Text style={[styles.incomeValue, payday === 0 && styles.incomeUnset]}>
          {payday > 0 ? peso(payday) : 'Tap to set'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.incomeRow}>
      <Text style={styles.incomeLabel}>Take-home per payday</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="₱ per payday"
        placeholderTextColor={text.faint}
        keyboardType="numeric"
        style={[styles.input, styles.incomeInput]}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        onBlur={save}
      />
    </View>
  );
}

/** One tap when pay actually lands — logs the payday as money in. Everything
 * follows from these entries: the balance, the graph, and the 50/30/20 lines. */
function PaydayButton({ payday }: { payday: number }) {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();
  // Today's entries, not today's total in: only a payday entry may block this
  // button. Side income, a gift or a refund logged the same day is not the payday,
  // and a total-in check would lock the button for the rest of the day.
  const { history, loading } = useMoneyHistory('day', dateKey());
  const logged = hasLoggedPayday(history?.entries ?? []); // guards a double-tap; tomorrow it's tappable again

  const log = async () => {
    // day '': the payday is being logged as it lands, so it belongs on today.
    await addMoney({ amount: payday, direction: 'in', note: PAYDAY_NOTE, bucket: null, day: '' });
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <Pressable
      onPress={logged ? undefined : () => void log()}
      // Held until today's entries are in: tapping before they load can't tell
      // whether the payday is already there, and would risk logging it twice.
      disabled={logged || loading}
      style={({ pressed }) => [styles.paydayBtn, logged && styles.paydayBtnDone, pressed && { opacity: 0.85 }]}
      accessibilityLabel={logged ? 'Payday already logged today' : `Log payday, ${peso(payday)} in`}
    >
      <Ionicons
        name={logged ? 'checkmark-circle' : 'cash-outline'}
        size={17}
        color={logged ? feedback.success : TONE}
      />
      <Text style={[styles.paydayBtnText, logged && { color: feedback.success }]}>
        {logged ? 'Money in today — logged' : `Payday landed — log ${peso(payday)} in`}
      </Text>
    </Pressable>
  );
}

/** Shown before take-home pay is set — which is also *why* the payday button isn't
 * on screen yet, so this says so rather than pointing at a control that isn't there. */
function EmptyState() {
  return (
    <Text style={styles.empty}>
      Tap “Take-home per payday” above to set what you actually clear. The one-tap payday button appears once it’s set,
      and the three lines split only money that has come in — 50% needs, 30% wants, 20% kept. Anything else you earn
      goes in “Log money” below.
    </Text>
  );
}

/**
 * The 50/30/20 worksheet. Take-home pay at the top, your standing monthly
 * commitments listed under needs and wants, and the three lines read against them.
 *
 * The split is fixed — that's the point of the rule, so there's nothing to
 * configure. Savings has no list of its own because it isn't something you commit
 * to: it's whatever income the other two buckets leave behind, which is what makes
 * a needs overrun visibly come out of it.
 */
export function BudgetWorksheet({ budget }: { budget: ApiBudget | undefined }) {
  const reading = readBudget(budget);
  const payday = budget?.monthly_income ?? 0; // stored per-payday amount — a setting, not money
  const commitments = budget?.commitments ?? [];

  return (
    <>
      <SystemPanel
        title="The 50/30/20 lines"
        sub={reading.received > 0 ? `of ${peso(reading.received)} in this month` : undefined}
      >
        <IncomeField payday={payday} />
        {payday > 0 ? <PaydayButton payday={payday} /> : null}
        {!reading.isSet ? (
          <EmptyState />
        ) : reading.received === 0 ? (
          // No money in yet this month — nothing to divide, so no lines. The rule
          // follows real money, never a projection of pay still to come.
          <Text style={styles.empty}>Nothing in yet this month. Log your payday when it lands and the lines follow.</Text>
        ) : (
          <>
            <BucketRow reading={reading.needs} daily={reading.daily.needs} />
            <BucketRow reading={reading.wants} daily={reading.daily.wants} />
            {/* Savings gets no daily line: it's what the other two leave behind,
                not something you spend a day's worth of. */}
            <BucketRow reading={reading.savings} />
            <Text style={styles.summary}>{summariseBudget(reading, peso)}</Text>
            {/* Say so rather than letting the buckets look complete when they aren't. */}
            {reading.untagged > 0 ? (
              <Text style={styles.untagged}>
                {peso(reading.untagged)} spent this month isn’t tagged needs or wants — it still counts against what
                you keep.
              </Text>
            ) : null}
          </>
        )}
      </SystemPanel>

      {EDITABLE.map((bucket) => (
        <SystemPanel key={bucket} title={BUCKET_LABEL[bucket]} sub={`${Math.round(BUDGET_SPLIT[bucket] * 100)}% of pay`}>
          <BucketLedger
            bucket={bucket}
            commitments={commitments.filter((c) => c.bucket === bucket)}
            target={reading[bucket].target}
          />
        </SystemPanel>
      ))}

      <SystemPanel title={BUCKET_LABEL.savings} sub="20% of pay">
        <Text style={styles.empty}>
          Nothing to add here — savings is what your pay has left after needs and wants. Trim either list and this
          grows.
        </Text>
        {/* Savings only means something once money is in — same gate as the lines.
            Before payday, commitments are just a plan, not a hole in savings. */}
        {reading.received > 0 ? (
          <View style={styles.savingsFigure}>
            <Text style={[styles.savingsAmount, { color: colorFor(reading.savings) }]}>
              {peso(reading.savings.planned)}
            </Text>
            <Text style={styles.bucketStanding}>{describeBucket(reading.savings, peso)}</Text>
          </View>
        ) : null}
      </SystemPanel>
    </>
  );
}

const styles = StyleSheet.create({
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: TAP,
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: surface.hairline,
  },
  incomeLabel: { color: text.secondary, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  incomeValue: { ...typography.numeral, fontSize: 28, color: text.primary, includeFontPadding: false },
  incomeUnset: { color: TONE, fontSize: 15, fontWeight: '700' },
  incomeInput: { minWidth: 130, textAlign: 'right' },

  paydayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: TAP,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: withAlpha(TONE, 0.5),
    backgroundColor: withAlpha(TONE, 0.06),
    marginBottom: 10,
  },
  paydayBtnDone: {
    borderStyle: 'solid',
    borderColor: withAlpha(feedback.success, 0.4),
    backgroundColor: withAlpha(feedback.success, 0.06),
  },
  paydayBtnText: { color: TONE, fontSize: 13, fontWeight: '700' },

  bucket: { marginTop: 14 },
  bucketHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  bucketName: { color: text.primary, fontSize: 14, fontWeight: '700' },
  bucketAmount: { fontSize: 13, fontWeight: '700' },
  bucketTarget: { color: text.secondary, fontWeight: '600' },
  bucketFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 5 },
  // text.secondary, not text.faint: faint taupe is 2.46:1 on an ivory card, which
  // is nowhere near legible for the line that carries the actual meaning.
  bucketStanding: { color: text.secondary, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  bucketShare: { color: text.secondary, fontSize: 12, fontWeight: '700' },
  bucketActual: { color: text.secondary, fontSize: 11, marginTop: 3 },
  daily: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  dailyLabel: { color: text.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  dailyAmount: { fontSize: 12, fontWeight: '700' },

  summary: {
    color: text.primary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },

  // Still here for the take-home pay field, the one input left on this panel.
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: text.primary,
    fontSize: 14,
    backgroundColor: surface.card,
    minHeight: TAP,
  },

  untagged: { color: text.secondary, fontSize: 11.5, lineHeight: 17, marginTop: 8 },
  savingsFigure: { marginTop: 12, gap: 2 },
  savingsAmount: { ...typography.numeral, fontSize: 24, includeFontPadding: false },

  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
});
