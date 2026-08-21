import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { dateKey, prettyDay, recentDays } from '@/lib/dates';
import { readMoneyDraft, type MoneyBucket, type MoneyDirection } from '@/lib/moneyEntry';
import { useSystem } from '@/store/useSystem';
import { STAT_META, surface, text, withAlpha } from '@/theme';

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

/** How far back the day strip reaches. A week covers "I forgot to log Tuesday";
 * older than that is rare enough not to earn the width. */
const DAYS_BACK = 7;

/** 'Today' / 'Yest.' / 'Wed 19' — the weekday is the point, since that's how a
 * forgotten spend is remembered ("that Thursday dinner"), not by date. */
function dayChipLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yest.';
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} ${d}`;
}

/** One selectable pill. 36pt box plus 6pt of hitSlop clears the 44pt target without
 * stacking three 44pt-tall rows into a form that also has inputs. */
function Chip({
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
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
 * The day strip is the other half of that: without it a spend can only be stamped
 * today, so a week caught up on in one sitting collapses onto one day and the real
 * day ends up written into the note.
 */
export function LogMoney() {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();

  const today = dateKey();
  const days = recentDays(today, DAYS_BACK);
  const yesterday = days[1] ?? '';

  const [direction, setDirection] = useState<MoneyDirection>('out');
  const [bucket, setBucket] = useState<BucketChoice>('needs');
  const [day, setDay] = useState(today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // '' rather than today's key when nothing is back-dated: the server already treats
  // a blank day as the day of the request, so this sends no opinion at all.
  const entry = readMoneyDraft({
    amount,
    note,
    direction,
    bucket: toBucket(bucket),
    day: day === today ? '' : day,
  });

  const submit = async () => {
    if (!entry) return; // half-typed — nothing to log yet
    setAmount('');
    setNote('');
    setDay(today); // the next line is almost always for today; back-dating is the exception
    await addMoney(entry);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <SystemPanel title="Log money">
      <View style={styles.chipRow}>
        {DIRECTIONS.map((d) => (
          <Chip key={d} label={DIRECTION_LABEL[d]} on={direction === d} onPress={() => setDirection(d)} />
        ))}
      </View>

      {/* Income isn't divided by the rule — it's what the rule divides — so the tags
          only exist on the way out. */}
      {direction === 'out' ? (
        <View style={styles.chipRow}>
          {BUCKET_CHOICES.map((b) => (
            <Chip
              key={b}
              label={BUCKET_LABEL[b]}
              on={bucket === b}
              onPress={() => setBucket(b)}
              accessibilityLabel={`Count against ${BUCKET_LABEL[b]}`}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.chipRow}>
        {days.map((d) => (
          <Chip
            key={d}
            label={dayChipLabel(d, today, yesterday)}
            on={day === d}
            onPress={() => setDay(d)}
            accessibilityLabel={d === today ? 'Today' : prettyDay(d)}
          />
        ))}
      </View>

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
  },
  chipOn: { borderColor: TONE, backgroundColor: withAlpha(TONE, 0.1) },
  chipText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: TONE },

  addRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
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
