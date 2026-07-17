import { StyleSheet, View } from 'react-native';

import { colors, withAlpha } from '@/theme';

interface Props {
  value: number;
  max: number;
  color?: string;
  height?: number;
}

export function XpBar({ value, max, color = colors.primary, height = 8 }: Props) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={[styles.track, { height }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${pct * 100}%` as `${number}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${withAlpha(color, 0.6)}`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(77, 166, 255, 0.15)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
  },
});
