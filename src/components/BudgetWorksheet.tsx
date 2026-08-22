import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FoldToggle } from '@/components/FoldToggle';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { Text, TextInput } from '@/components/ui/Text';
import type { ApiBudget, ApiCommitment } from '@/lib/api';
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
import { useShowMore } from '@/hooks/useShowMore';
import { peso } from '@/lib/money';
import { hasLoggedPayday, PAYDAY_NOTE } from '@/lib/moneyEntry';
import { num } from '@/lib/num';
import { useMoneyHistory } from '@/query/useMoneyHistory';
import { useSystem } from '@/store/useSystem';
import { STAT_META, TAP_MIN, feedback, radius, surface, text, typography, withAlpha } from '@/theme';

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

/** Live and unpaid — the only state in which a line still wants a tap. Shared so the
 * row and the fold that hides it can't disagree about what's still owed. */
function isPayable(item: ApiCommitment): boolean {
  return item.active && !item.paid_this_month;
}

function CommitmentRow({ item, onPay, onRemove }: { item: ApiCommitment; onPay: () => void; onRemove: () => void }) {
  const meta = [
    item.due_day > 0 ? `${item.due_day}${ordinal(item.due_day)}` : null,
    item.variable ? 'varies' : null,
    item.paid_this_month ? 'paid' : 'tap to pay',
  ]
    .filter(Boolean)
    .join(' · ');
  // Unpaid → tapping the row logs the spend against this bucket (one tap, never
  // retyped). Paid ones aren't tappable — the month's obligation is already met.
  const payable = isPayable(item);

  return (
    <View style={styles.line}>
      <Pressable
        onPress={payable ? onPay : undefined}
        disabled={!payable}
        style={styles.lineMain}
        accessibilityLabel={payable ? `Mark ${item.label} paid, ${peso(item.amount)}` : `${item.label}, paid`}
      >
        {/* Paid gets a tick as well as the word — a colour alone wouldn't say it. */}
        <Ionicons
          name={item.paid_this_month ? 'checkmark-circle' : 'ellipse-outline'}
          size={17}
          color={item.paid_this_month ? feedback.success : TONE}
        />
        <View style={styles.lineText}>
          <Text style={styles.lineLabel} numberOfLines={1}>
            {item.label}
          </Text>
          {meta ? <Text style={styles.lineMeta}>{meta}</Text> : null}
        </View>
        <Text style={styles.lineAmount}>{peso(item.amount)}</Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.label}`} style={styles.lineRemove}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

/** How many commitment rows a bucket shows before it starts folding them away. */
const VISIBLE_LINES = 10;

/**
 * One bucket's commitments, capped so a long list doesn't bury the rest of the
 * screen. Order is left exactly as the server sorted it (dated bills in due order,
 * then undated) — a collapsed list that reshuffles itself is harder to read than a
 * long one.
 *
 * Pagination was the other option and is worse here: pages put the thing you want
 * behind a control you have to operate, and the count is small enough that "show
 * the rest" is one tap instead of several.
 */
/** What the fold says it's holding back. Hiding a bill that still needs paying is the
 * one bad outcome here, so that gets named rather than folded into a row count. */
function describeFold(expanded: boolean, hidden: number, unpaid: number): string {
  if (expanded) return 'Show fewer';
  if (unpaid > 0) return `${hidden} more · ${unpaid} still to pay`;
  return `${hidden} more`;
}

function CommitmentList({
  items,
  onPay,
  onRemove,
}: {
  items: ApiCommitment[];
  onPay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { shown, rest, folds, expanded, toggle } = useShowMore(items, VISIBLE_LINES);

  return (
    <>
      {shown.map((item) => (
        <CommitmentRow key={item.id} item={item} onPay={() => onPay(item.id)} onRemove={() => onRemove(item.id)} />
      ))}
      {folds ? (
        <FoldToggle
          expanded={expanded}
          label={describeFold(expanded, rest.length, rest.filter(isPayable).length)}
          total={items.length}
          color={TONE}
          onPress={toggle}
          style={styles.foldDivider}
        />
      ) : null}
    </>
  );
}

function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return 'st';
  if (day % 10 === 2 && day !== 12) return 'nd';
  if (day % 10 === 3 && day !== 13) return 'rd';
  return 'th';
}

/** Add a line to one bucket: label, monthly amount, and an optional due day. */
function AddLine({ bucket }: { bucket: 'needs' | 'wants' }) {
  const addCommitment = useSystem((s) => s.addCommitment);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');

  const submit = async () => {
    const value = num(amount);
    if (!label.trim() || value <= 0) return;
    const day = Math.round(num(dueDay));
    setLabel('');
    setAmount('');
    setDueDay('');
    await addCommitment({
      label: label.trim(),
      amount: value,
      bucket,
      due_day: day >= 1 && day <= 31 ? day : 0,
    });
  };

  return (
    <View style={styles.addRow}>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder={bucket === 'needs' ? 'Rent, internet…' : 'Eating out, gym…'}
        placeholderTextColor={text.faint}
        style={[styles.input, styles.inputLabel]}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="₱"
        placeholderTextColor={text.faint}
        keyboardType="numeric"
        style={[styles.input, styles.inputAmount]}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <TextInput
        value={dueDay}
        onChangeText={setDueDay}
        placeholder="day"
        placeholderTextColor={text.faint}
        keyboardType="numeric"
        style={[styles.input, styles.inputDay]}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
        accessibilityLabel={`Add a ${bucket} line`}
      >
        <Ionicons name="add" size={18} color={TONE} />
      </Pressable>
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
  const removeCommitment = useSystem((s) => s.removeCommitment);
  const payCommitment = useSystem((s) => s.payCommitment);
  const qc = useQueryClient();
  const reading = readBudget(budget);
  const payday = budget?.monthly_income ?? 0; // stored per-payday amount — a setting, not money
  const commitments = budget?.commitments ?? [];

  // Paying a commitment writes a money-out entry, so refresh the graph on /money.
  const pay = async (id: string) => {
    await payCommitment(id);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

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

      {EDITABLE.map((bucket) => {
        const items = commitments.filter((c) => c.bucket === bucket);
        const share = Math.round(BUDGET_SPLIT[bucket] * 100);
        return (
          <SystemPanel key={bucket} title={BUCKET_LABEL[bucket]} sub={`${share}% of pay`}>
            {items.length === 0 ? (
              <Text style={styles.empty}>
                {bucket === 'needs'
                  ? 'Rent, bills, groceries — what you owe every month.'
                  : 'The things you choose. Eating out, subscriptions, hobbies.'}
              </Text>
            ) : (
              <CommitmentList
                items={items}
                onPay={(id) => void pay(id)}
                onRemove={(id) => void removeCommitment(id)}
              />
            )}
            <AddLine bucket={bucket} />
          </SystemPanel>
        );
      })}

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

  line: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  lineMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: TAP },
  lineText: { flex: 1, minWidth: 0 },
  lineLabel: { color: text.primary, fontSize: 13 },
  lineMeta: { color: text.secondary, fontSize: 11, marginTop: 1 },
  lineAmount: { color: text.primary, fontSize: 13, fontWeight: '700' },
  lineRemove: { minWidth: 24, minHeight: TAP, alignItems: 'flex-end', justifyContent: 'center' },
  remove: { color: text.secondary, fontSize: 18, fontWeight: '700' },

  // Reads as a continuation of the list it folds, so it carries the same hairline.
  // The fold sits at the foot of a ruled list, so it keeps the rule going.
  foldDivider: { borderTopWidth: 1, borderTopColor: surface.hairline },

  addRow: { flexDirection: 'row', gap: 6, marginTop: 12, alignItems: 'center' },
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
  inputLabel: { flex: 1, minWidth: 0 },
  inputAmount: { width: 76 },
  inputDay: { width: 52 },
  addBtn: {
    width: TAP,
    height: TAP,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    borderWidth: 1,
    borderColor: TONE,
    backgroundColor: withAlpha(TONE, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },

  untagged: { color: text.secondary, fontSize: 11.5, lineHeight: 17, marginTop: 8 },
  savingsFigure: { marginTop: 12, gap: 2 },
  savingsAmount: { ...typography.numeral, fontSize: 24, includeFontPadding: false },

  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
});
