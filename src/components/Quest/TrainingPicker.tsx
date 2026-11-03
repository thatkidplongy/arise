import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { ApiTraining, TrainingSession } from '@/lib/api';
import { TAP_MIN, ink, press, radius, typography } from '@/theme';

/** The shortest honest name for a session — the card's own title already says it
 * in full, so the rail says it in one word. */
const SHORT: Record<TrainingSession, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  court: 'Court',
};

/**
 * What are you training today?
 *
 * The first thing the Physical card asks, every day. One of the four is always
 * already picked — the weekday's own session — so this is a correction rather than
 * a gate: a day you never answer still deals a full plan. Switching deals that
 * session's movements instead, and drops the ticks from the one you left.
 */
export function TrainingPicker({
  training,
  disabled,
  onPick,
}: {
  training: ApiTraining;
  disabled?: boolean;
  onPick: (session: TrainingSession) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.ask}>
        {training.chosen ? 'Training today' : "Today's session — change it if the day went differently"}
      </Text>
      <View style={styles.rail} accessibilityRole="tablist">
        {training.options.map((opt) => {
          const on = opt.key === training.session;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onPick(opt.key)}
              disabled={disabled || on}
              accessibilityRole="tab"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: on, disabled }}
              style={({ pressed }) => [
                styles.opt,
                on && styles.optOn,
                pressed && !on && { opacity: press.strong },
              ]}
            >
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {SHORT[opt.key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  ask: { ...typography.tiny, color: ink.textFaint },
  rail: {
    flexDirection: 'row',
    gap: 5,
    padding: 4,
    backgroundColor: ink.track,
    borderRadius: radius.pill,
  },
  opt: {
    flex: 1,
    minHeight: TAP_MIN - 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  optOn: { backgroundColor: ink.clayFill },
  label: { ...typography.label, fontSize: 12, color: ink.textDim },
  labelOn: { color: ink.accent },
});
