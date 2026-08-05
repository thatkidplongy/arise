import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import type { ApiBudget, ApiCommitment } from '@/lib/api';
import {
  BUCKET_LABEL,
  BUDGET_SPLIT,
  PAYS_PER_MONTH,
  describeBucket,
  readBudget,
  summariseBudget,
  type BucketReading,
} from '@/lib/budget';
import { peso } from '@/lib/money';
import { num } from '@/lib/num';
import { useSystem } from '@/store/useSystem';
import { STAT_META, feedback, surface, text, withAlpha } from '@/theme';

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

function BucketRow({ reading }: { reading: BucketReading }) {
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
    </View>
  );
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
  const payable = item.active && !item.paid_this_month;

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

/** The pay label + "twice a month" hint — shared by the read and edit states. */
function IncomeLabel() {
  return (
    <View style={styles.incomeText}>
      <Text style={styles.incomeLabel}>Take-home pay per payday</Text>
      <Text style={styles.incomeHint}>paid twice a month</Text>
    </View>
  );
}

/** Take-home pay — everything else is a share of this, so it comes first. Salary
 * lands twice a month, so you enter one payday; the budget runs on payday × 2. */
function IncomeField({ income }: { income: number }) {
  const setIncome = useSystem((s) => s.setIncome);
  const payday = income / PAYS_PER_MONTH;
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const save = async () => {
    const value = num(draft);
    setEditing(false);
    const monthly = value * PAYS_PER_MONTH;
    if (value > 0 && monthly !== income) await setIncome(monthly);
  };

  if (!editing) {
    return (
      <Pressable
        onPress={() => {
          setDraft(income > 0 ? String(payday) : '');
          setEditing(true);
        }}
        style={styles.incomeRow}
        accessibilityLabel="Edit take-home pay per payday"
      >
        <IncomeLabel />
        <View style={styles.incomeFigure}>
          <Text style={[styles.incomeValue, income === 0 && styles.incomeUnset]}>
            {income > 0 ? peso(payday) : 'Tap to set'}
          </Text>
          {income > 0 ? <Text style={styles.incomeSub}>{peso(income)} a month</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.incomeRow}>
      <IncomeLabel />
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

function EmptyState() {
  return (
    <Text style={styles.empty}>
      Set your payday take-home and the three monthly lines appear — 50% needs, 30% wants, 20% left to save.
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
  const commitments = budget?.commitments ?? [];

  // Paying a commitment writes a money-out entry, so refresh the graph on /money.
  const pay = async (id: string) => {
    await payCommitment(id);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <>
      <SystemPanel title="The 50/30/20 lines">
        <IncomeField income={reading.income} />
        {!reading.isSet ? (
          <EmptyState />
        ) : (
          <>
            <BucketRow reading={reading.needs} />
            <BucketRow reading={reading.wants} />
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
              items.map((item) => (
                <CommitmentRow
                  key={item.id}
                  item={item}
                  onPay={() => void pay(item.id)}
                  onRemove={() => void removeCommitment(item.id)}
                />
              ))
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
        {reading.isSet ? (
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
  incomeText: { flexShrink: 1 },
  incomeLabel: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  incomeHint: { color: text.secondary, fontSize: 11, marginTop: 1 },
  incomeFigure: { alignItems: 'flex-end' },
  incomeValue: { color: text.primary, fontSize: 20, fontWeight: '800' },
  incomeSub: { color: text.secondary, fontSize: 11, fontWeight: '600', marginTop: 1 },
  incomeUnset: { color: TONE, fontSize: 15, fontWeight: '700' },
  incomeInput: { minWidth: 130, textAlign: 'right' },

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

  addRow: { flexDirection: 'row', gap: 6, marginTop: 12, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
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
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TONE,
    backgroundColor: withAlpha(TONE, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },

  untagged: { color: text.secondary, fontSize: 11.5, lineHeight: 17, marginTop: 8 },
  savingsFigure: { marginTop: 12, gap: 2 },
  savingsAmount: { fontSize: 22, fontWeight: '800' },

  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
});
