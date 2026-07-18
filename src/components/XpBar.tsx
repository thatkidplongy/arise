import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { accent, withAlpha } from '@/theme';

interface Props {
  value: number;
  max: number;
  color?: string;
  height?: number;
}

export function XpBar({ value, max, color = accent, height = 6 }: Props) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const anim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 400, useNativeDriver: false }).start();
  }, [anim, pct]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.track, { height, backgroundColor: withAlpha(color, 0.14) }]}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
  },
});
