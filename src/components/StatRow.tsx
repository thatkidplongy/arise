import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { statLevelInfo } from '@/lib/leveling';
import { useSystem } from '@/store/useSystem';
import { colors, STAT_META, withAlpha } from '@/theme';
import type { StatKey } from '@/types';

import { XpBar } from './XpBar';

export function StatRow({ stat }: { stat: StatKey }) {
  const xp = useSystem((s) => s.statXp[stat]);
  const meta = STAT_META[stat];
  const info = statLevelInfo(xp);

  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.code}>{stat}</Text>
          <Text style={styles.label}>{meta.label}</Text>
          <Text style={styles.level}>Lv {info.level}</Text>
        </View>
        <XpBar value={info.into} max={info.needed} color={meta.color} height={6} />
        <Text style={styles.sub}>{meta.sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  code: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },
  label: {
    color: colors.textDim,
    fontSize: 13,
  },
  level: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 'auto',
  },
  sub: {
    color: colors.textDim,
    fontSize: 11,
  },
});
