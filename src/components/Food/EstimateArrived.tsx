import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PortionRow } from '@/components/Food/PlateDots';
import { RangeBar, scaleAcross } from '@/components/Food/RangeBar';
import { Button } from '@/components/ui/Button';
import { Kicker, SectionTitle } from '@/components/ui/Card';
import { ChoiceChip, ChoiceRow } from '@/components/ui/ChoiceChip';
import { Field } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import type { ApiFoodDay, ApiPlate } from '@/lib/api';
import { sayHandoffRange, type Handoff } from '@/lib/handoff';
import { PORTION, PORTION_ORDER, SLOTS, slotLabel, type PlateDraft } from '@/lib/plate';
import { TAP_MIN, clay, neutral, radius, sage, shadow, space, surface, text, typography } from '@/theme';

/**
 * An estimate that arrived from somewhere else, held up for review before it
 * lands.
 *
 * This screen exists because receiving a figure is not the same as making one.
 * Arise's own photo read produces portions the app is confident about; a handoff
 * arrives already priced by something the app cannot see, so the whole design
 * problem is that **an imported number must never look like a measured one**.
 * Hence: the badge says where it came from, the spread is stated in the same
 * breath as the figure, the slot is shown as a guess rather than applied, and
 * nothing at all is written until you press the button.
 *
 * A label read is the one case presented as exact — printed numbers beat any
 * estimate the app could make, so it narrows the day instead of widening it.
 */
export function EstimateArrived({
  handoff,
  draft,
  day,
  busy,
  onChange,
  onSubmit,
  onClose,
}: {
  /** The estimate as it arrived — kept beside the draft so the screen can show
   * what was proposed even after you've corrected it. */
  handoff: Handoff | null;
  draft: PlateDraft | null;
  /** Today as already logged, so the projection can say where this lands. */
  day: ApiFoodDay;
  busy: boolean;
  onChange: (next: PlateDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  // How many of the panel's servings were eaten. Local to this screen because it
  // is a reading of the *photo*, not a correction of the plate: changing it
  // rescales the printed figures rather than editing them.
  const [servings, setServings] = useState(handoff?.servings ?? 1);

  if (!handoff || !draft) return null;
  const label = handoff.source === 'label';
  const range = sayHandoffRange(handoff);
  const set = (patch: Partial<PlateDraft>) => onChange({ ...draft, ...patch });

  /** Rescale the label's figures without touching what you've corrected by hand —
   * the slot you picked and the place you typed survive a change of servings. */
  const rescale = (next: number) => {
    const n = Math.max(1, Math.min(MAX_SERVINGS, next));
    setServings(n);
    set({
      kcal: handoff.kcal * n,
      protein_g: handoff.protein_g * n,
      fibre_g: handoff.fibre_g * n,
      grams: handoff.serving_g * n,
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <SectionTitle>{label ? 'Read from a label' : 'An estimate arrived'}</SectionTitle>
              <Text style={styles.from}>from Claude</Text>
            </View>

            <View style={styles.estimate}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, label ? styles.badgeExact : styles.badgeGuess]}>
                  <Text style={[styles.badgeText, label ? styles.badgeTextExact : null]}>
                    {label ? 'LABEL · EXACT' : 'PHOTO ESTIMATE'}
                  </Text>
                </View>
                <Text style={styles.spread}>{label ? 'no range needed' : 'wide spread'}</Text>
              </View>

              <Text style={styles.name}>{draft.name || slotLabel(draft.slot)}</Text>
              <View style={styles.figureRow}>
                <Text style={styles.figure}>
                  {label ? '' : '~'}
                  {(label ? draft.kcal : handoff.kcal).toLocaleString()}
                </Text>
                <Text style={styles.figureUnit}>{range ? `kcal · ${range}` : 'kcal'}</Text>
              </View>
              {label && handoff.serving_g ? (
                <Text style={styles.perServing}>
                  {handoff.kcal.toLocaleString()} kcal per {handoff.serving_g} g serving, as printed
                </Text>
              ) : null}

              <View style={styles.macros}>
                <Macro
                  label="Protein"
                  value={`${label ? '' : '~'}${label ? draft.protein_g : handoff.protein_g} g`}
                />
                <Macro
                  label="Fibre"
                  value={`${label ? '' : '~'}${label ? draft.fibre_g : handoff.fibre_g} g`}
                />
              </View>

              {label ? null : (
                <>
                  <View style={styles.hairline} />
                  <View style={styles.plate}>
                    <Kicker>On the plate</Kicker>
                    {PORTION_ORDER.map((unit) => (
                      <View key={unit} style={styles.plateRow}>
                        <Text style={styles.plateLabel}>
                          {PORTION[unit].label}{' '}
                          <Text style={styles.plateMeasure}>· {PORTION[unit].measure}</Text>
                        </Text>
                        <PortionRow unit={unit} count={draft.plate[unit]} target={0} />
                      </View>
                    ))}
                    <Text style={styles.correct}>
                      Not how you remember it? Correct any row in the sheet after this — the
                      estimate is a starting point, not a reading.
                    </Text>
                  </View>
                </>
              )}
            </View>

            {label ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel}>How much did you eat?</Text>
                <View style={styles.stepper}>
                  <Step label="−" onPress={() => rescale(servings - 1)} disabled={servings <= 1} />
                  <View style={styles.stepperMid}>
                    <Text style={styles.stepperCount}>{servings}</Text>
                    <Text style={styles.stepperUnit}>
                      {servings === 1 ? 'serving' : 'servings'}
                      {handoff.serving_g ? ` · ${handoff.serving_g * servings} g` : ''}
                    </Text>
                  </View>
                  <Step
                    label="+"
                    onPress={() => rescale(servings + 1)}
                    disabled={servings >= MAX_SERVINGS}
                  />
                </View>
                {/* Offered only when the panel printed a pack size — a guessed
                    pack would rescale every figure above it. */}
                {handoff.pack_servings > 1 ? (
                  <ChoiceRow>
                    <ChoiceChip
                      label="One serving"
                      on={servings === 1}
                      onPress={() => rescale(1)}
                    />
                    <ChoiceChip
                      label={`Whole pack · ${handoff.pack_servings}`}
                      on={servings === handoff.pack_servings}
                      onPress={() => rescale(handoff.pack_servings)}
                    />
                  </ChoiceRow>
                ) : null}
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.blockLabel}>
                Log it as <Text style={styles.blockHint}>— Claude guessed {slotLabel(handoff.slot).toLowerCase()}</Text>
              </Text>
              <ChoiceRow>
                {SLOTS.map((slot) => (
                  <ChoiceChip
                    key={slot}
                    label={slotLabel(slot)}
                    on={draft.slot === slot}
                    onPress={() => set({ slot })}
                  />
                ))}
              </ChoiceRow>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockLabel}>Place</Text>
              <Field
                value={draft.place}
                onChangeText={(place) => set({ place })}
                placeholder="add where you ate"
                placeholderTextColor={text.faint}
                accessibilityLabel="Where you ate"
              />
            </View>

            <Projection day={day} handoff={handoff} plate={draft.plate} label={label} />

            <View style={styles.actions}>
              <Button label="Discard" tone="ghost" onPress={onClose} disabled={busy} />
              <Button
                label={label ? 'Add it' : 'Log this meal'}
                onPress={onSubmit}
                busy={busy}
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

/** Twenty servings of anything is a pack, not a portion — past that the stepper
 * is a worse tool than retyping the figure. */
const MAX_SERVINGS = 20;

function Step({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'One more serving' : 'One fewer serving'}
      style={({ pressed }) => [styles.step, disabled && styles.stepOff, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{value}</Text>
    </View>
  );
}

/**
 * Where the day lands once this is logged — the reason to review rather than
 * just tap yes.
 *
 * The projection is deliberately a range against the band and never a verdict:
 * this is portions turned into calories, and the honest error on a day of bought
 * food is wide enough that "you're over" would be a claim the data can't make.
 * An exact label read narrows the span; a plate of hands widens it, and saying so
 * is the point.
 */
function Projection({
  day,
  handoff,
  plate,
  label,
}: {
  day: ApiFoodDay;
  handoff: Handoff;
  plate: ApiPlate;
  label: boolean;
}) {
  // The arriving plate's own contribution. A label read is added as the printed
  // figure with a narrow spread; a plate of hands widens the day by roughly the
  // span the sender stated. Both are approximations of what the server will
  // recompute the moment this lands — shown here only to answer "and then what?".
  const addLow = label ? handoff.kcal : handoff.low || handoff.kcal;
  const addHigh = label ? handoff.kcal : handoff.high || handoff.kcal;
  const low = day.kcal_low + addLow;
  const high = day.kcal_high + addHigh;
  if (!high) return null;

  const banded = day.band_high > 0;
  const scale = scaleAcross([{ low, high }], day.band_low, day.band_high);
  const portions = plate.protein + plate.veg + plate.carb + plate.extra;

  return (
    <View style={styles.projection}>
      <Kicker color={sage[800]}>After this lands</Kicker>
      <View style={styles.figureRow}>
        <Text style={styles.projFigure}>
          {low.toLocaleString()}–{high.toLocaleString()}
        </Text>
        <Text style={styles.figureUnit}>kcal today</Text>
      </View>
      {banded ? (
        <RangeBar
          low={low}
          high={high}
          bandLow={day.band_low}
          bandHigh={day.band_high}
          scale={scale}
          compact
        />
      ) : null}
      <Text style={styles.projNote}>
        {banded ? verdict(low, high, day.band_low, day.band_high) : 'Set a profile and this gets a band to sit against.'}
        {portions ? ` Adds ${portions} portion${portions === 1 ? '' : 's'} to the day.` : ''}
      </Text>
    </View>
  );
}

/** Said as a probability, because that is all a range can support. */
function verdict(low: number, high: number, bandLow: number, bandHigh: number): string {
  if (low > bandHigh) return 'Probably above your band once this lands.';
  if (high < bandLow) return 'Probably still under your band, with room left.';
  return 'Probably inside your band.';
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
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  from: { ...typography.small, color: text.secondary, marginLeft: 'auto' },

  estimate: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGuess: { backgroundColor: surface.clayFill },
  badgeExact: { backgroundColor: surface.sageFill },
  badgeText: { ...typography.kicker, fontSize: 9.5, color: clay[800] },
  badgeTextExact: { color: sage[900] },
  spread: { ...typography.small, color: text.secondary, marginLeft: 'auto' },

  name: { ...typography.cardTitle, color: neutral[900] },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  figure: { ...typography.numeral, fontSize: 29, lineHeight: 31, color: neutral[900] },
  figureUnit: { ...typography.small, color: text.secondary },

  macros: { flexDirection: 'row', gap: 16 },
  macro: { flex: 1, gap: 2 },
  macroLabel: { ...typography.small, color: text.secondary },
  macroValue: { ...typography.cardTitle, color: neutral[900] },

  perServing: { ...typography.small, color: text.secondary },
  hairline: { height: 1, backgroundColor: surface.hairline },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: surface.card,
    borderRadius: radius.md,
    padding: space.sm,
  },
  stepperMid: { flex: 1, alignItems: 'center', gap: 1 },
  stepperCount: { ...typography.numeral, fontSize: 19, lineHeight: 22, color: neutral[900] },
  stepperUnit: { ...typography.small, color: text.secondary },
  step: {
    width: TAP_MIN,
    height: TAP_MIN,
    borderRadius: radius.pill,
    backgroundColor: surface.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.4 },
  stepLabel: { ...typography.numeral, fontSize: 17, lineHeight: 20, color: neutral[800] },

  plate: { gap: space.sm },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plateLabel: { ...typography.body, flex: 1, color: neutral[900] },
  plateMeasure: { color: text.secondary },
  correct: { ...typography.small, color: text.secondary },

  block: { gap: space.sm },
  blockLabel: { ...typography.label, color: neutral[900], paddingLeft: 4 },
  blockHint: { ...typography.small, color: text.secondary },

  projection: {
    backgroundColor: surface.sagePatch,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 6,
  },
  projFigure: { ...typography.numeral, fontSize: 22, lineHeight: 25, color: neutral[900] },
  projNote: { ...typography.small, color: sage[900] },

  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  grow: { flex: 1 },
});
