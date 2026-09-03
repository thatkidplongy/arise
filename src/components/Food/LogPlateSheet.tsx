import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PORTION_COLOR } from '@/components/Food/PlateDots';
import { Button } from '@/components/ui/Button';
import { Kicker, SectionTitle } from '@/components/ui/Card';
import { ChoiceChip, ChoiceRow } from '@/components/ui/ChoiceChip';
import { Field } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import {
  MAX_PER_PLATE,
  PORTION,
  PORTION_ORDER,
  SLOTS,
  isDraftLoggable,
  slotLabel,
  type PlateDraft,
  type PortionKey,
} from '@/lib/plate';
import { TAP_MIN, clay, neutral, radius, shadow, space, surface, text, typography } from '@/theme';

/**
 * The whole logging flow: what it was, where, and how many hands of each thing.
 *
 * Every figure is a tap, never a keyboard — that's the point of the hand as a
 * unit. Anything an estimate proposed arrives pre-filled and fully editable, so a
 * guess from a photo is a starting point rather than something logged behind your
 * back.
 */
export function LogPlateSheet({
  draft,
  busy,
  onChange,
  onSubmit,
  onClose,
}: {
  /** The plate being built, or null when the sheet is closed. */
  draft: PlateDraft | null;
  busy: boolean;
  onChange: (next: PlateDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!draft) return null;
  const set = (patch: Partial<PlateDraft>) => onChange({ ...draft, ...patch });
  const setPortion = (unit: PortionKey, n: number) =>
    set({ plate: { ...draft.plate, [unit]: Math.max(0, Math.min(MAX_PER_PLATE, n)) } });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <SectionTitle>Log a plate</SectionTitle>
            <Text style={styles.blurb}>
              Your own hand is the measure — a palm, a fist, a cupped hand. Close enough is the
              whole idea.
            </Text>

            <ChoiceRow style={styles.slots}>
              {SLOTS.map((slot) => (
                <ChoiceChip
                  key={slot}
                  label={slotLabel(slot)}
                  on={draft.slot === slot}
                  onPress={() => set({ slot })}
                />
              ))}
            </ChoiceRow>

            <Field
              value={draft.name}
              onChangeText={(name) => set({ name })}
              placeholder="What was it? (adobo & rice)"
              maxLength={80}
            />
            <Field
              value={draft.place}
              onChangeText={(place) => set({ place })}
              placeholder="Where? (home, Aling Nena's)"
              maxLength={60}
            />

            {draft.note ? <Text style={styles.note}>{draft.note}</Text> : null}

            <View style={styles.steppers}>
              {PORTION_ORDER.map((unit) => (
                <Stepper
                  key={unit}
                  unit={unit}
                  value={draft.plate[unit]}
                  onChange={(n) => setPortion(unit, n)}
                />
              ))}
            </View>

            {draft.kcal > 0 ? <LabelNumbers draft={draft} /> : null}

            <View style={styles.actions}>
              <Button label="Cancel" tone="ghost" onPress={onClose} />
              <Button
                label="Log it"
                onPress={onSubmit}
                busy={busy}
                disabled={!isDraftLoggable(draft)}
                large
                style={styles.grow}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One portion row: the measure, a count, and the two taps that change it. */
function Stepper({
  unit,
  value,
  onChange,
}: {
  unit: PortionKey;
  value: number;
  onChange: (n: number) => void;
}) {
  const meta = PORTION[unit];
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperMain}>
        <Text style={styles.stepperLabel}>{meta.label}</Text>
        <Text style={styles.stepperMeasure}>{meta.measure}</Text>
      </View>
      <View style={styles.counter}>
        <Step label="−" onPress={() => onChange(value - 1)} disabled={value === 0} unit={unit} />
        <Text style={[styles.count, value > 0 ? { color: PORTION_COLOR[unit] } : null]}>{value}</Text>
        <Step label="+" onPress={() => onChange(value + 1)} disabled={value >= MAX_PER_PLATE} unit={unit} />
      </View>
    </View>
  );
}

function Step({
  label,
  onPress,
  disabled,
  unit,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  unit: PortionKey;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label === '+' ? 'Add' : 'Remove'} ${PORTION[unit].measure}`}
      style={({ pressed }) => [
        styles.step,
        pressed && !disabled ? { backgroundColor: clay[200] } : null,
        disabled ? styles.stepOff : null,
      ]}
    >
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

/** A packaged food read off its own label keeps the numbers it printed — those are
 * measured, not guessed, and dropping them would throw away the good ones. */
function LabelNumbers({ draft }: { draft: PlateDraft }) {
  return (
    <View style={styles.label}>
      <Kicker>Off the label</Kicker>
      <Text style={styles.labelNumbers}>
        {draft.kcal.toLocaleString()} kcal · {draft.protein_g}g protein · {draft.fibre_g}g fibre
      </Text>
      <Text style={styles.labelWhy}>
        Kept as printed — these are measured. They feed the week&apos;s trend, not today&apos;s screen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: surface.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: surface.base,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    ...shadow.lg,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: surface.edge,
    marginTop: 10,
  },
  body: { padding: space.xl - 4, paddingBottom: 40, gap: space.md },
  blurb: { ...typography.small, color: text.secondary, marginTop: -6 },
  slots: { marginBottom: 2 },
  note: { ...typography.small, color: clay[700], marginTop: -4 },
  steppers: {
    backgroundColor: surface.card,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
  },
  stepperMain: { flex: 1, gap: 1 },
  stepperLabel: { ...typography.cardTitle, color: neutral[900] },
  stepperMeasure: { ...typography.tiny, color: text.secondary },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: {
    width: TAP_MIN,
    height: TAP_MIN,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface.muted,
  },
  stepOff: { opacity: 0.35 },
  stepLabel: { ...typography.section, fontSize: 19, lineHeight: 22, color: neutral[800] },
  count: {
    ...typography.numeral,
    fontSize: 19,
    width: 26,
    textAlign: 'center',
    color: text.faint,
  },
  label: {
    backgroundColor: surface.sagePatch,
    borderRadius: radius.md,
    padding: space.md,
    gap: 3,
  },
  labelNumbers: { ...typography.cardTitle, color: neutral[900] },
  labelWhy: { ...typography.tiny, color: text.secondary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  grow: { flex: 1 },
});
