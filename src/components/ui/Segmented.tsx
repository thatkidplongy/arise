import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, clay, neutral, radius, text, typography } from '@/theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}

/** A pill rail with a pill inside it — two or three mutually exclusive views. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.rail} accessibilityRole="tablist">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.opt, on ? styles.optOn : null]}
          >
            <Text style={[styles.label, { color: on ? clay[700] : text.secondary }]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    backgroundColor: neutral[200],
    borderRadius: radius.pill,
  },
  opt: {
    flex: 1,
    minHeight: TAP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  optOn: { backgroundColor: neutral[100] },
  label: typography.button,
});
