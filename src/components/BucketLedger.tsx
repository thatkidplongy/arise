import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/ui/Text';
import type { ApiCommitment, ApiMoneyEntry } from '@/lib/api';
import { readBucketLedger, type LedgerDay } from '@/lib/bucketLedger';
import { dateKey, formatClock, formatDayBand, toUtcIso } from '@/lib/dates';
import { peso } from '@/lib/money';
import { readMoneyDraft } from '@/lib/moneyEntry';
import { useMoneyHistory } from '@/query/useMoneyHistory';
import { useSystem } from '@/store/useSystem';
import { STAT_META, TAP_MIN, feedback, radius, sage, surface, text, typography, withAlpha } from '@/theme';

const TONE = STAT_META.WLT.color; // the wealth attribute's tone, as everywhere on this screen

/** WCAG 2.5.5 — anything tappable clears 44pt. */
const TAP = 44;

type LedgerBucket = 'needs' | 'wants';

const EMPTY_COPY: Record<LedgerBucket, string> = {
  needs: 'Rent, bills, groceries — what you owe every month.',
  wants: 'The things you choose. Eating out, subscriptions, hobbies.',
};

const ADD_PLACEHOLDER: Record<LedgerBucket, string> = {
  needs: 'Groceries, fare…',
  wants: 'Milk tea, a treat…',
};

function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return 'st';
  if (day % 10 === 2 && day !== 12) return 'nd';
  if (day % 10 === 3 && day !== 13) return 'rd';
  return 'th';
}

/** What the cycle has cost so far, against the bucket's share of pay. */
function Headline({ spent, target }: { spent: number; target: number }) {
  return (
    <View style={styles.headline}>
      <Text style={styles.headlineAmount}>{peso(spent)}</Text>
      <Text style={styles.headlineOf}>{target > 0 ? `of ${peso(target)} this cycle` : 'this cycle'}</Text>
    </View>
  );
}

/** One logged spend inside a day band. The clock only shows on today's rows — on an
 * older day, which day it was is the whole story and the band already says it. */
function EntryRow({ entry, today, onRemove }: { entry: ApiMoneyEntry; today: string; onRemove: () => void }) {
  const meta = [
    entry.commitment_id ? 'bill' : null,
    'paid',
    entry.day === today ? formatClock(new Date(toUtcIso(entry.created_at))) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.line}>
      <View style={styles.lineMain}>
        {/* Paid gets a tick as well as the word — a colour alone wouldn't say it. */}
        <Ionicons name="checkmark-circle" size={17} color={feedback.success} />
        <View style={styles.lineText}>
          <Text style={styles.lineLabel} numberOfLines={1}>
            {entry.note}
          </Text>
          <Text style={styles.lineMeta}>{meta}</Text>
        </View>
        <Text style={styles.lineAmount}>{peso(entry.amount)}</Text>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        accessibilityLabel={`Remove ${entry.note}, ${peso(entry.amount)}`}
        style={styles.lineRemove}
      >
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

/** A bill still owed this month — one tap logs the spend, never retyped. */
function DueRow({ item, onPay, onRemove }: { item: ApiCommitment; onPay: () => void; onRemove: () => void }) {
  const meta = [
    item.due_day > 0 ? `due the ${item.due_day}${ordinal(item.due_day)}` : null,
    item.variable ? 'varies' : null,
    'tap to pay',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.line}>
      <Pressable
        onPress={onPay}
        style={styles.lineMain}
        accessibilityLabel={`Mark ${item.label} paid, ${peso(item.amount)}`}
      >
        <Ionicons name="ellipse-outline" size={17} color={TONE} />
        <View style={styles.lineText}>
          <Text style={styles.lineLabel} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={styles.lineMeta}>{meta}</Text>
        </View>
        <Text style={styles.lineAmount}>{peso(item.amount)}</Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.label}`} style={styles.lineRemove}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

/** The collapsed row's middle word: how much a closed band is holding. */
function describeBand(band: LedgerDay): string {
  if (band.entries.length === 0) return 'nothing yet';
  if (band.bills > 0 && band.bills === band.entries.length) {
    return band.bills === 1 ? '1 bill' : `bills · ${band.bills}`;
  }
  return band.entries.length === 1 ? '1 entry' : `${band.entries.length} entries`;
}

/** One calendar day of the ledger: a header that always carries the day's total,
 * over rows that fold away so a month of history stays one screen tall. */
function DayBand({
  band,
  today,
  expanded,
  onToggle,
  onRemoveEntry,
  children,
}: {
  band: LedgerDay;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  onRemoveEntry: (entry: ApiMoneyEntry) => void;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.band, band.day === today && styles.bandToday]}>
      <Pressable
        onPress={onToggle}
        style={styles.bandHead}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${formatDayBand(band.day, today)}, ${describeBand(band)}, ${peso(band.total)}`}
      >
        <Text style={styles.bandTitle}>{formatDayBand(band.day, today)}</Text>
        <Text style={styles.bandCount}>{describeBand(band)}</Text>
        <View style={styles.bandSpring} />
        <Text style={styles.bandTotal}>{peso(band.total)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={text.secondary} />
      </Pressable>
      {expanded ? (
        <View style={styles.bandBody}>
          {band.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={today} onRemove={() => onRemoveEntry(entry)} />
          ))}
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Log a spend onto today, from inside today's band — label, pesos, done. */
function AddToToday({ bucket }: { bucket: LedgerBucket }) {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');

  // No day at all: the spend is being logged as it happens, so it lands on today.
  const draft = readMoneyDraft({ amount, note, direction: 'out', bucket });

  const submit = async () => {
    if (!draft) return; // half-typed — nothing to log yet
    setNote('');
    setAmount('');
    await addMoney(draft);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <View style={styles.addRow}>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={ADD_PLACEHOLDER[bucket]}
        placeholderTextColor={text.faint}
        style={[styles.input, styles.inputNote]}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="₱"
        placeholderTextColor={text.faint}
        keyboardType="numeric"
        style={[styles.input, styles.inputAmount]}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Pressable
        onPress={() => void submit()}
        disabled={!draft}
        style={({ pressed }) => [styles.addBtn, !draft && styles.addBtnOff, pressed && { opacity: 0.85 }]}
        accessibilityLabel={`Add to today's ${bucket}`}
      >
        <Ionicons name="add" size={18} color={draft ? TONE : text.faint} />
      </Pressable>
    </View>
  );
}

/** The bills still owed this month. Its own band rather than rows scattered over
 * future days, so nothing unpaid is ever more than one glance away. */
function StillToPay({
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
        style={styles.bandHead}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Still to pay, ${count}, ${peso(total)}`}
      >
        <Text style={styles.bandTitle}>Still to pay</Text>
        <Text style={styles.bandCount}>{count}</Text>
        <View style={styles.bandSpring} />
        <Text style={styles.bandTotal}>{peso(total)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={text.secondary} />
      </Pressable>
      {expanded ? (
        <View style={styles.bandBody}>
          {due.map((item) => (
            <DueRow key={item.id} item={item} onPay={() => onPay(item.id)} onRemove={() => onRemove(item.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One bucket's dated ledger: what this cycle has cost, what today cost, what's
 * still owed, and every earlier day folded to a single line. Replaces the flat
 * commitment list, where a Tuesday snack and the rent sat at the same weight and
 * "what did today cost me" had no answer at all.
 *
 * The rows are the month's money entries, so a spend logged anywhere — a paid
 * bill, the ledger's own add row, the Log money form — lands in the same band.
 */
export function BucketLedger({
  bucket,
  commitments,
  target,
}: {
  bucket: LedgerBucket;
  commitments: ApiCommitment[];
  /** The bucket's share of the money in this month, for the headline. */
  target: number;
}) {
  const payCommitment = useSystem((s) => s.payCommitment);
  const removeCommitment = useSystem((s) => s.removeCommitment);
  const removeMoney = useSystem((s) => s.removeMoney);
  const qc = useQueryClient();

  const today = dateKey();
  const { history } = useMoneyHistory('month', today);
  const ledger = readBucketLedger(history?.entries ?? [], commitments, bucket, today);

  // Today starts open — it's the question the ledger answers. Every other band
  // starts as one line, so a month of history stays scannable.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (day: string) => open[day] ?? day === today;
  const toggle = (day: string) => setOpen((o) => ({ ...o, [day]: !(o[day] ?? day === today) }));

  const refresh = () => void qc.invalidateQueries({ queryKey: ['money-history'] });
  const pay = async (id: string) => {
    await payCommitment(id);
    refresh();
  };
  // Also how a mis-tapped "pay" is undone: paid_this_month is derived from the
  // entry, so deleting a bill's payment puts the bill back on the due list.
  const removeEntry = async (id: string) => {
    await removeMoney(id);
    refresh();
  };

  const [todayBand, ...pastBands] = ledger.days;
  const untouched = ledger.spent === 0 && ledger.due.length === 0;

  return (
    <>
      {untouched ? <Text style={styles.empty}>{EMPTY_COPY[bucket]}</Text> : <Headline spent={ledger.spent} target={target} />}
      <DayBand
        band={todayBand}
        today={today}
        expanded={isOpen(today)}
        onToggle={() => toggle(today)}
        onRemoveEntry={(entry) => void removeEntry(entry.id)}
      >
        <AddToToday bucket={bucket} />
      </DayBand>
      <StillToPay
        due={ledger.due}
        total={ledger.dueTotal}
        onPay={(id) => void pay(id)}
        onRemove={(id) => void removeCommitment(id)}
      />
      {pastBands.map((band) => (
        <DayBand
          key={band.day}
          band={band}
          today={today}
          expanded={isOpen(band.day)}
          onToggle={() => toggle(band.day)}
          onRemoveEntry={(entry) => void removeEntry(entry.id)}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  headlineAmount: { ...typography.numeral, fontSize: 28, color: text.primary, includeFontPadding: false },
  headlineOf: { color: text.secondary, fontSize: 13, fontWeight: '600', flexShrink: 1 },

  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },

  band: {
    borderRadius: radius.md,
    backgroundColor: surface.muted,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  bandToday: { backgroundColor: sage[100] },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP },
  bandTitle: {
    color: text.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bandCount: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  bandSpring: { flex: 1 },
  bandTotal: { color: text.primary, fontSize: 14, fontWeight: '700' },
  bandBody: { paddingBottom: 8 },

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

  addRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
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
  inputNote: { flex: 1, minWidth: 0 },
  inputAmount: { width: 84 },
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
  addBtnOff: { borderColor: surface.hairline, backgroundColor: 'transparent' },
});
