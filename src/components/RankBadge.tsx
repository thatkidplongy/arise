import { StyleSheet, Text, View } from 'react-native';

import { RANK_COLORS, withAlpha } from '@/theme';
import type { Rank } from '@/types';

interface Props {
  rank: Rank;
  size?: number;
}

export function RankBadge({ rank, size = 64 }: Props) {
  const color = RANK_COLORS[rank];
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderColor: color,
          boxShadow: `0 0 16px ${withAlpha(color, 0.35)}`,
        },
      ]}
    >
      <Text style={[styles.letter, { color, fontSize: size * 0.5 }]}>{rank}</Text>
      <Text style={[styles.caption, { color }]}>RANK</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  letter: {
    fontWeight: '800',
    lineHeight: undefined,
  },
  caption: {
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
    opacity: 0.8,
  },
});
