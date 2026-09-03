import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import type { MealSlot } from '@/lib/api';
import { handoffFromText, type Handoff } from '@/lib/handoff';
import { clay, space, text as textColor, typography } from '@/theme';

/**
 * The way an estimate gets in when there is no share sheet.
 *
 * A share target ("Share → Arise") is the version of this that survives daily
 * use, but it needs a native build to exist. Paste needs nothing, works today,
 * and — being the same parser the deep link uses — cannot drift from it. So it
 * ships as the floor rather than the goal: whatever transport lands later, the
 * contract it carries is already fixed and already tested here.
 *
 * Nothing typed here is logged. A successful parse opens the review screen; that
 * is the whole of what this component can do.
 */
export function EstimateInbox({
  slot,
  onReceive,
}: {
  /** The meal the day is waiting on — the slot a payload inherits when the sender
   * didn't guess one. */
  slot: MealSlot;
  onReceive: (handoff: Handoff) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');

  const read = () => {
    const arrived = handoffFromText(pasted, slot);
    if (!arrived) {
      // Said as a description of the payload, not a scolding of the paste: the
      // usual cause is copying the prose half of the card instead of the fields.
      setError("That doesn't look like an estimate — paste the card's field block, or its arise:// link.");
      return;
    }
    setPasted('');
    setError('');
    setOpen(false);
    onReceive(arrived);
  };

  if (!open) {
    return (
      <Button
        label="Paste an estimate"
        icon="clipboard-outline"
        tone="quiet"
        block
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Paste what the Claude skill gave you — the field block, or the arise:// link. It opens for
        review before anything lands.
      </Text>
      <TextArea
        value={pasted}
        onChangeText={(next) => {
          setPasted(next);
          setError('');
        }}
        placeholder={'{ "kcal": 1170, "low": 900, "high": 1450, … }'}
        placeholderTextColor={textColor.faint}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Paste an estimate"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button
          label="Cancel"
          tone="ghost"
          onPress={() => {
            setOpen(false);
            setPasted('');
            setError('');
          }}
        />
        <Button label="Read it" onPress={read} disabled={!pasted.trim()} style={styles.grow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  hint: { ...typography.small, color: textColor.secondary },
  error: { ...typography.small, color: clay[700] },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  grow: { flex: 1 },
});
