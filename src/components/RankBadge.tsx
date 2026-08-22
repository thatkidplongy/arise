import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { RANK_FILL, radius, typography } from '@/theme';
import type { Rank } from '@/types';

interface Props {
  rank: Rank;
  size?: number;
  /** The small tracked word under the letter. Pass null to show the letter alone. */
  caption?: string | null;
}

/** A tinted disc with the rank letter in the display face. S is the one that inverts. */
export function RankBadge({ rank, size = 58, caption = 'rank' }: Props) {
  const fill = RANK_FILL[rank];
  return (
    <View style={[styles.badge, { width: size, height: size, backgroundColor: fill.bg }]}>
      <Text style={[styles.letter, { color: fill.fg, fontSize: size * 0.4 }]}>{rank}</Text>
      {caption ? <Text style={[styles.caption, { color: fill.fg }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    ...typography.numeral,
    includeFontPadding: false,
  },
  caption: {
    ...typography.kicker,
    fontSize: 8.5,
    letterSpacing: 1.1,
    marginTop: 1,
    opacity: 0.85,
  },
});
