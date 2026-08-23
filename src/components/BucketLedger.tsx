import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DayBand, bandRow } from '@/components/DayBand';
import { DueBills } from '@/components/DueBills';
import { Button } from '@/components/ui/Button';
import { Text, TextInput } from '@/components/ui/Text';
import type { ApiCommitment, ApiMoneyEntry } from '@/lib/api';
import { useDayBands } from '@/hooks/useDayBands';
import { readBucketLedger, type LedgerDay } from '@/lib/bucketLedger';
import { dateKey, formatClock, toUtcIso } from '@/lib/dates';
import { peso } from '@/lib/money';
import { readMoneyDraft } from '@/lib/moneyEntry';
import { useMoneyHistory } from '@/query/useMoneyHistory';
import { useSystem } from '@/store/useSystem';
import { TAP_MIN, feedback, radius, surface, text, typography } from '@/theme';

type LedgerBucket = 'needs' | 'wants';

const EMPTY_COPY: Record<LedgerBucket, string> = {
  needs: 'Rent, bills, groceries — what you owe every month.',
  wants: 'The things you choose. Eating out, subscriptions, hobbies.',
};

const ADD_PLACEHOLDER: Record<LedgerBucket, string> = {
  needs: 'Groceries, fare…',
  wants: 'Milk tea, a treat…',
};

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
    <View style={bandRow.row}>
      <View style={bandRow.main}>
        {/* Paid gets a tick as well as the word — a colour alone wouldn't say it. */}
        <Ionicons name="checkmark-circle" size={17} color={feedback.success} />
        <View style={bandRow.text}>
          <Text style={bandRow.label} numberOfLines={1}>
            {entry.note}
          </Text>
          <Text style={bandRow.meta}>{meta}</Text>
        </View>
        <Text style={bandRow.amount}>{peso(entry.amount)}</Text>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        accessibilityLabel={`Remove ${entry.note}, ${peso(entry.amount)}`}
        style={bandRow.remove}
      >
        <Text style={bandRow.removeGlyph}>×</Text>
      </Pressable>
    </View>
  );
}

/** The band header's middle word: what a closed day is holding. */
function describeBand(band: LedgerDay): string {
  if (band.items.length === 0) return 'nothing yet';
  if (band.bills > 0 && band.bills === band.items.length) {
    return band.bills === 1 ? '1 bill' : `bills · ${band.bills}`;
  }
  return band.items.length === 1 ? '1 entry' : `${band.items.length} entries`;
}

/**
 * Log a spend onto today, from inside today's band. Rests as the one filled button
 * on the card, because adding to today is what this panel is for; the fields only
 * appear once you've asked for them, so a card you're only reading stays readable.
 */
function AddToToday({ bucket }: { bucket: LedgerBucket }) {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');

  // No day at all: the spend is being logged as it happens, so it lands on today.
  const draft = readMoneyDraft({ amount, note, direction: 'out', bucket });

  const close = () => {
    setOpen(false);
    setNote('');
    setAmount('');
  };

  const submit = async () => {
    if (!draft) return; // half-typed — nothing to log yet
    setNote('');
    setAmount('');
    await addMoney(draft);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  if (!open) {
    return <Button label="Add to today" onPress={() => setOpen(true)} block style={styles.primary} />;
  }

  return (
    <View style={styles.addForm}>
      <View style={styles.addRow}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={ADD_PLACEHOLDER[bucket]}
          placeholderTextColor={text.faint}
          style={[styles.input, styles.inputNote]}
          autoFocus
          returnKeyType="next"
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
      </View>
      {/* Stays open after a log — one sitting is usually more than one spend. */}
      <Button label="Add to today" onPress={() => void submit()} disabled={!draft} block />
      <Button label="Done" onPress={close} tone="ghost" block />
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
 * bill, the ledger's own add button, the Log money form — lands in the same band.
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

  const bands = useDayBands(today);

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
      {untouched ? (
        <Text style={styles.empty}>{EMPTY_COPY[bucket]}</Text>
      ) : (
        <Headline spent={ledger.spent} target={target} />
      )}
      <DayBand
        day={todayBand.day}
        today={today}
        meta={describeBand(todayBand)}
        trailing={peso(todayBand.total)}
        expanded={bands.isOpen(todayBand.day)}
        onToggle={() => bands.toggle(todayBand.day)}
      >
        {todayBand.items.map((entry) => (
          <EntryRow key={entry.id} entry={entry} today={today} onRemove={() => void removeEntry(entry.id)} />
        ))}
        <AddToToday bucket={bucket} />
      </DayBand>
      <DueBills
        due={ledger.due}
        total={ledger.dueTotal}
        onPay={(id) => void pay(id)}
        onRemove={(id) => void removeCommitment(id)}
      />
      {pastBands.map((band) => (
        <DayBand
          key={band.day}
          day={band.day}
          today={today}
          meta={describeBand(band)}
          trailing={peso(band.total)}
          expanded={bands.isOpen(band.day)}
          onToggle={() => bands.toggle(band.day)}
        >
          {band.items.map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={today} onRemove={() => void removeEntry(entry.id)} />
          ))}
        </DayBand>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  headlineAmount: { ...typography.numeral, fontSize: 28, color: text.primary, includeFontPadding: false },
  headlineOf: { color: text.secondary, fontSize: 13, fontWeight: '600', flexShrink: 1 },

  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },

  addForm: { paddingTop: 10, gap: 8 },
  addRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: text.primary,
    fontSize: 14,
    backgroundColor: surface.card,
    minHeight: TAP_MIN,
  },
  inputNote: { flex: 1, minWidth: 0 },
  inputAmount: { width: 90, textAlign: 'right' },
  primary: { marginTop: 10 },
});
