import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { readMoneyDraft, type MoneyBucket, type MoneyDirection } from '@/lib/moneyEntry';
import { useSystem } from '@/store/useSystem';
import { STAT_META, feedback, surface, text, withAlpha } from '@/theme';

const TONE = STAT_META.WLT.color; // the wealth attribute's tone, as everywhere on this screen

/** WCAG 2.5.5 — anything tappable clears 44pt. */
const TAP = 44;

const DIRECTIONS: MoneyDirection[] = ['in', 'out'];
const DIRECTION_LABEL: Record<MoneyDirection, string> = { in: 'Money in', out: 'Money out' };
const NOTE_PLACEHOLDER: Record<MoneyDirection, string> = {
  in: 'Side income, gift, refund…',
  out: 'Groceries, transport…',
};
/** Money in reads sage, money out brick — the same pairing the tracker's totals use. */
const DIRECTION_TONE: Record<MoneyDirection, string> = { in: feedback.success, out: feedback.danger };

const BUCKETS: MoneyBucket[] = ['needs', 'wants', null];
const BUCKET_LABEL = (bucket: MoneyBucket): string => bucket ?? 'Untagged';

/**
 * Anything that isn't a payday or a standing commitment: side income, a gift, a
 * refund, a one-off spend. The payday button and the commitment rows above are
 * one-tap shortcuts for the two predictable cases — this is the general form, so
 * the log can hold money the plan didn't know about.
 *
 * Spending can be tagged needs or wants to count against the 50/30/20 lines, or
 * left untagged, which the worksheet then says out loud rather than quietly
 * dropping. Money in takes no tag: income is what the split divides.
 */
export function LogMoney() {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();

  const [direction, setDirection] = useState<MoneyDirection>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [bucket, setBucket] = useState<MoneyBucket>(null);

  const entry = readMoneyDraft({ amount, note, direction, bucket });

  const submit = async () => {
    if (!entry) return; // half-typed — nothing to log yet
    setAmount('');
    setNote('');
    await addMoney(entry.amount, entry.direction, entry.note, entry.bucket);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <SystemPanel title="Log money">
      {/* In or out. Direction first: it decides whether a bucket even applies. */}
      <View style={styles.row}>
        {DIRECTIONS.map((d) => {
          const on = direction === d;
          return (
            <Pressable
              key={d}
              onPress={() => setDirection(d)}
              style={[styles.segment, on && { borderColor: DIRECTION_TONE[d], backgroundColor: withAlpha(DIRECTION_TONE[d], 0.1) }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={DIRECTION_LABEL[d]}
            >
              <Text style={[styles.segmentText, on && { color: DIRECTION_TONE[d] }]}>{DIRECTION_LABEL[d]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.addRow}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={NOTE_PLACEHOLDER[direction]}
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

      {/* Only money out is divided by the rule, so the tags only show for money out. */}
      {direction === 'out' ? (
        <View style={styles.row}>
          {BUCKETS.map((b) => {
            const on = bucket === b;
            return (
              <Pressable
                key={BUCKET_LABEL(b)}
                onPress={() => setBucket(b)}
                style={[styles.segment, on && styles.segmentOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Tag as ${BUCKET_LABEL(b)}`}
              >
                <Text style={[styles.segmentText, styles.bucketText, on && styles.segmentTextOn]}>
                  {BUCKET_LABEL(b)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Text style={styles.hint}>
        {direction === 'in'
          ? 'Anything that isn’t your payday — side income, a gift, a refund. It joins the pay the 50/30/20 lines divide.'
          : 'Tag it needs or wants to count it against the lines, or leave it untagged — it still comes off what you keep.'}
      </Text>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  segmentOn: { borderColor: TONE, backgroundColor: withAlpha(TONE, 0.1) },
  // text.secondary, not text.faint: faint taupe is 2.46:1 on an ivory card, and an
  // unselected segment still has to be readable.
  segmentText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  segmentTextOn: { color: TONE },
  bucketText: { textTransform: 'capitalize' },

  addRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 10, alignItems: 'center' },
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
  inputNote: { flex: 1, minWidth: 0 },
  inputAmount: { width: 92 },
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
  addBtnOff: { borderColor: surface.hairline, backgroundColor: 'transparent' },

  hint: { color: text.secondary, fontSize: 11.5, lineHeight: 17, marginTop: 10 },
});
