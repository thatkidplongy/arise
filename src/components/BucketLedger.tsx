import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DayBand, bandRow } from '@/components/DayBand';
import { BillRow, DueBills } from '@/components/DueBills';
import { Button } from '@/components/ui/Button';
import { ChoiceChip, ChoiceRow } from '@/components/ui/ChoiceChip';
import { Text, TextInput } from '@/components/ui/Text';
import type { ApiCommitment, ApiMoneyEntry } from '@/lib/api';
import { useDayBands } from '@/hooks/useDayBands';
import { readBucketLedger, type LedgerDay } from '@/lib/bucketLedger';
import { dateKey, formatClock, formatDayChip, formatDayInline, recentDays, toUtcIso } from '@/lib/dates';
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

/** How many days back the strip offers. A week covers everything you'd remember
 * having forgotten; past that the day stops being "Tuesday" and becomes a date. */
const DAY_CHOICES = 7;

/**
 * The one way into this bucket: pick the day, say what it was, log it.
 *
 * The day comes first because it's the question with a default — today, nearly
 * always — so the common case is still type-and-log, while the bill you settled on
 * Friday and only remembered now is one tap away instead of hidden behind expanding
 * the right band. Bills owed are offered here too, against whichever day is chosen,
 * so filing a late payment is the same gesture as logging a late spend.
 */
function LogSpend({
  bucket,
  today,
  due,
  onPayOn,
}: {
  bucket: LedgerBucket;
  today: string;
  due: ApiCommitment[];
  onPayOn: (id: string, on: string) => void;
}) {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');

  const when = formatDayInline(day, today);
  // Today sends no day at all — the server stamps the request's own day, which is what
  // logging a spend as it happens means, and keeps the phone's midnight authoritative.
  const draft = readMoneyDraft({ amount, note, direction: 'out', bucket, day: day === today ? '' : day });

  const close = () => {
    setOpen(false);
    setDay(today);
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
    return <Button label="Add a spend" onPress={() => setOpen(true)} block style={styles.primary} />;
  }

  return (
    <View style={styles.addForm}>
      <ChoiceRow>
        {recentDays(today, DAY_CHOICES).map((d) => (
          <ChoiceChip
            key={d}
            label={formatDayChip(d, today)}
            on={d === day}
            onPress={() => setDay(d)}
            accessibilityLabel={`File onto ${formatDayInline(d, today)}`}
          />
        ))}
      </ChoiceRow>
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
      {/* The day stays put after a log — one sitting is usually more than one spend,
          and catching up on a forgotten Friday is several. */}
      <Button label={`Add to ${when}`} onPress={() => void submit()} disabled={!draft} block />
      {due.length > 0 ? (
        <>
          <Text style={styles.orBills}>Or a bill you paid {when}</Text>
          {due.map((item) => (
            <BillRow
              key={item.id}
              item={item}
              onPay={() => onPayOn(item.id, day)}
              action="tap to file it here"
              spoken={`File ${item.label} as paid ${when}, ${peso(item.amount)}`}
            />
          ))}
        </>
      ) : null}
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
  // Paying onto an earlier day — a bill settled Friday and only remembered now. The
  // month still decides whether it's owed, so this only moves which day carries it.
  const payOn = async (id: string, on: string) => {
    await payCommitment(id, undefined, on);
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
      <LogSpend bucket={bucket} today={today} due={ledger.due} onPayOn={(id, on) => void payOn(id, on)} />
      <DayBand
        day={todayBand.day}
        today={today}
        meta={describeBand(todayBand)}
        trailing={peso(todayBand.total)}
        expanded={bands.isOpen(todayBand.day)}
        onToggle={() => bands.toggle(todayBand.day)}
      >
        {todayBand.items.length === 0 ? (
          // The add form used to live in here, so an empty today is now genuinely
          // empty — say so rather than opening onto a blank strip of card.
          <Text style={bandRow.empty}>Nothing logged today yet.</Text>
        ) : (
          todayBand.items.map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={today} onRemove={() => void removeEntry(entry.id)} />
          ))
        )}
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
  orBills: { color: text.secondary, fontSize: 12, fontWeight: '600', paddingTop: 6 },

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
