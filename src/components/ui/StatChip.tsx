import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { STAT_META, STAT_TINT, clay, font, neutral, radius, typography, withAlpha } from '@/theme';
import type { StatKey } from '@/types';

/**
 * An attribute, as a disc. The three letters carry it — the icon set never reads at
 * this size, and seven tinted circles down a card is the whole Status screen.
 */
export function StatChip({ statKey, size = 44, style }: { statKey: StatKey; size?: number; style?: ViewStyle }) {
  const { color } = STAT_META[statKey];
  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, backgroundColor: withAlpha(color, STAT_TINT) },
        style,
      ]}
    >
      <Text style={[styles.key, { color, fontSize: size * 0.24 }]}>{statKey}</Text>
    </View>
  );
}

/**
 * The big number: level on Status, a count on Quests. One kicker under one
 * enormous Caprasimo numeral, ringed in the clay ramp.
 */
export function Disc({
  value,
  caption,
  size = 86,
  tone = 'clay',
}: {
  value: string | number;
  caption: string;
  size?: number;
  tone?: 'clay' | 'sage';
}) {
  const skin = tone === 'clay' ? DISC_CLAY : DISC_SAGE;
  return (
    <View style={[styles.disc, skin.box, { width: size, height: size }]}>
      <Text style={[styles.value, { color: skin.fg, fontSize: size * 0.4 }]}>{value}</Text>
      <Text style={[styles.caption, { color: skin.sub }]}>{caption}</Text>
    </View>
  );
}

const DISC_CLAY = {
  box: { backgroundColor: clay[200], borderWidth: 3, borderColor: clay[400] },
  fg: clay[800],
  sub: clay[700],
};
const DISC_SAGE = {
  box: { backgroundColor: '#E1EECC' },
  fg: '#3D472B',
  sub: '#56633F',
};

const styles = StyleSheet.create({
  disc: {
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  key: {
    fontFamily: font.semibold,
    letterSpacing: 0.2,
  },
  value: {
    ...typography.numeral,
    color: neutral[900],
    includeFontPadding: false,
  },
  caption: {
    ...typography.kicker,
    fontSize: 9,
    letterSpacing: 1.1,
    marginTop: 1,
  },
});
