import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, accent, neutral, radius, shadow, surface, text, typography } from '@/theme';

const TRACK_W = 56;
const TRACK_H = 33;
const KNOB = 27;
const PAD = 3;

/** The one switch shape in the app: clay when on, sand when off, no labels inside. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (next: boolean) => void; label: string }) {
  const [anim] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [anim, value]);

  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [PAD, TRACK_W - KNOB - PAD] });
  const background = anim.interpolate({ inputRange: [0, 1], outputRange: [surface.edge, accent] });

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
    >
      <Animated.View style={[styles.track, { backgroundColor: background }]}>
        <Animated.View style={[styles.knob, shadow.sm, { left }]} />
      </Animated.View>
    </Pressable>
  );
}

/** Toggle plus the two lines that explain it — the Settings row, everywhere. */
export function ToggleRow({
  title,
  blurb,
  value,
  onChange,
}: {
  title: string;
  blurb?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {blurb ? <Text style={styles.blurb}>{blurb}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: radius.pill,
    backgroundColor: neutral[100],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: TAP_MIN,
  },
  copy: { flex: 1, gap: 3 },
  title: { ...typography.cardTitle, color: neutral[900] },
  blurb: { ...typography.small, color: text.secondary },
});
