import { StyleSheet, Text, View } from 'react-native';

import { RANK_COLORS, withAlpha } from '@/theme';
import type { Rank } from '@/types';

interface Props {
  rank: Rank;
  size?: number;
}

/** A flat, warm tile — the rank letter carries it, no glow. */
export function RankBadge({ rank, size = 60 }: Props) {
  const color = RANK_COLORS[rank];
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderColor: color, backgroundColor: withAlpha(color, 0.1) },
      ]}
    >
      <Text style={[styles.letter, { color, fontSize: size * 0.46 }]}>{rank}</Text>
      <Text style={[styles.caption, { color }]}>rank</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontWeight: '700',
  },
  caption: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: -2,
  },
});
