import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { accent, motion, radius, withAlpha } from '@/theme';

interface Props {
  value: number;
  max: number;
  color?: string;
  height?: number;
  /** The track behind the fill. Defaults to a soft tint of the fill's own colour. */
  track?: string;
}

/** Every progress bar in the app: a pill on a tinted pill, filling left to right. */
export function XpBar({ value, max, color = accent, height = 8, track }: Props) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  // State, not a ref: building the width style means reading this during render,
  // which a ref forbids. It starts at the current fill, so the bar is already the
  // right length on first paint — only later changes need the animation to run.
  const [anim] = useState(() => new Animated.Value(pct));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: motion.bar,
      easing: Easing.bezier(...motion.easing),
      useNativeDriver: false,
    }).start();
  }, [anim, pct]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.track, { height, backgroundColor: track ?? withAlpha(color, 0.18) }]}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
