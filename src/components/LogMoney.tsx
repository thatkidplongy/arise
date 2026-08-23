import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { ChoiceChip, ChoiceRow } from '@/components/ui/ChoiceChip';
import { Text, TextInput } from '@/components/ui/Text';
import { readMoneyDraft, type MoneyBucket, type MoneyDirection } from '@/lib/moneyEntry';
import { useSystem } from '@/store/useSystem';
import { STAT_META, TAP_MIN, radius, surface, text, withAlpha } from '@/theme';

const TONE = STAT_META.WLT.color; // the wealth attribute's tone, as everywhere on this screen

/** WCAG 2.5.5 — anything tappable clears 44pt. */
const TAP = 44;

const DIRECTIONS: MoneyDirection[] = ['out', 'in'];
const DIRECTION_LABEL: Record<MoneyDirection, string> = { out: 'Spent', in: 'Received' };
const PLACEHOLDER: Record<MoneyDirection, string> = {
  out: 'Groceries, dinner, fare…',
  in: 'Side income, gift, refund…',
};
const HINT: Record<MoneyDirection, string> = {
  out: 'For a one-off. A standing bill belongs in needs or wants above — tap its row and it logs itself.',
  in: 'Anything that isn’t your payday. It joins the pay the 50/30/20 lines divide, so it takes no tag.',
};

/** 'untagged' is this form's word for no bucket at all; the API takes null. Offered
 * explicitly rather than left as an empty state, because untagged spending still
 * counts against what you keep and the worksheet has to call it out. */
type BucketChoice = 'needs' | 'wants' | 'untagged';
const BUCKET_CHOICES: BucketChoice[] = ['needs', 'wants', 'untagged'];
const BUCKET_LABEL: Record<BucketChoice, string> = { needs: 'Needs', wants: 'Wants', untagged: 'Untagged' };

function toBucket(choice: BucketChoice): MoneyBucket {
  return choice === 'untagged' ? null : choice;
}

/**
 * The free-form money line: a one-off spend, or money in that isn't the payday.
 *
 * Spending is here as well as on the commitment rows because the two are different
 * things. A standing bill is a row you tap; a Thursday dinner is not a monthly
 * commitment, and filing it as one means it comes back as an unpaid bill on the 1st
 * for the rest of time. Being able to log it here is what keeps that list to the
 * bills that actually recur.
 *
 * Every line lands on the day it's logged. The wire still carries a day and the
 * server still honours one, so back-dating stays possible — it just isn't worth a
 * seven-pill row above a two-field form.
 */
export function LogMoney() {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();

  const [direction, setDirection] = useState<MoneyDirection>('out');
  const [bucket, setBucket] = useState<BucketChoice>('needs');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // No day at all: the server stamps the entry with the day of the request.
  const entry = readMoneyDraft({ amount, note, direction, bucket: toBucket(bucket) });

  const submit = async () => {
    if (!entry) return; // half-typed — nothing to log yet
    setAmount('');
    setNote('');
    await addMoney(entry);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <SystemPanel title="Log money">
      <ChoiceRow style={styles.chipRow}>
        {DIRECTIONS.map((d) => (
          <ChoiceChip key={d} label={DIRECTION_LABEL[d]} on={direction === d} onPress={() => setDirection(d)} />
        ))}
      </ChoiceRow>

      {/* Income isn't divided by the rule — it's what the rule divides — so the tags
          only exist on the way out. */}
      {direction === 'out' ? (
        <ChoiceRow style={styles.chipRow}>
          {BUCKET_CHOICES.map((b) => (
            <ChoiceChip
              key={b}
              label={BUCKET_LABEL[b]}
              on={bucket === b}
              onPress={() => setBucket(b)}
              accessibilityLabel={`Count against ${BUCKET_LABEL[b]}`}
            />
          ))}
        </ChoiceRow>
      ) : null}

      <View style={styles.addRow}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={PLACEHOLDER[direction]}
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
          disabled={!entry}
          style={({ pressed }) => [styles.addBtn, !entry && styles.addBtnOff, pressed && { opacity: 0.85 }]}
          accessibilityLabel={`Log ${DIRECTION_LABEL[direction].toLowerCase()}`}
        >
          <Ionicons name="add" size={18} color={entry ? TONE : text.faint} />
        </Pressable>
      </View>

      <Text style={styles.hint}>{HINT[direction]}</Text>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  chipRow: { marginBottom: 8 },

  addRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
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
  inputAmount: { width: 92 },
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

  hint: { color: text.secondary, fontSize: 11.5, lineHeight: 17, marginTop: 10 },
});
