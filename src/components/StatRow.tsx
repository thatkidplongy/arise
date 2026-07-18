import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiStat } from '@/lib/api';
import { STAT_META, text, withAlpha } from '@/theme';

import { XpBar } from './XpBar';

export function StatRow({ stat }: { stat: ApiStat }) {
  const meta = STAT_META[stat.key];

  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Ionicons name={meta.icon} size={17} color={meta.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{meta.label}</Text>
          <Text style={styles.level}>Lv {stat.level}</Text>
        </View>
        <XpBar value={stat.into} max={stat.needed} color={meta.color} height={4} />
        <Text style={styles.sub}>{meta.sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 9,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 5,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    color: text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  level: {
    color: text.secondary,
    fontSize: 13,
    marginLeft: 'auto',
  },
  sub: {
    color: text.faint,
    fontSize: 11,
  },
});
