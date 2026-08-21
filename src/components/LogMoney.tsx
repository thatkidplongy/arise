import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { readMoneyDraft } from '@/lib/moneyEntry';
import { useSystem } from '@/store/useSystem';
import { STAT_META, surface, text, withAlpha } from '@/theme';

const TONE = STAT_META.WLT.color; // the wealth attribute's tone, as everywhere on this screen

/** WCAG 2.5.5 — anything tappable clears 44pt. */
const TAP = 44;

/**
 * Money in that isn't the payday: side income, a gift, a refund. The payday button
 * above is the one-tap shortcut for the predictable case; this is for the rest.
 *
 * Deliberately income-only. Spending is already accounted for by the commitment
 * rows under needs and wants — a second way to log it here just meant two places
 * to look for the same number. The cost is that a one-off spend with no commitment
 * row has nowhere to go from this screen; the API still takes one
 * (POST /money, direction 'out') if that turns out to matter.
 *
 * No needs/wants tag, and never one: income isn't divided by the 50/30/20 rule,
 * it's what the rule divides.
 */
export function LogMoney() {
  const addMoney = useSystem((s) => s.addMoney);
  const qc = useQueryClient();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const entry = readMoneyDraft({ amount, note, direction: 'in', bucket: null });

  const submit = async () => {
    if (!entry) return; // half-typed — nothing to log yet
    setAmount('');
    setNote('');
    await addMoney(entry.amount, entry.direction, entry.note, entry.bucket);
    void qc.invalidateQueries({ queryKey: ['money-history'] });
  };

  return (
    <SystemPanel title="Money in">
      <View style={styles.addRow}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Side income, gift, refund…"
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
          accessibilityLabel="Log money in"
        >
          <Ionicons name="add" size={18} color={entry ? TONE : text.faint} />
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Anything that isn’t your payday — side income, a gift, a refund. It joins the pay the 50/30/20 lines divide.
      </Text>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
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
