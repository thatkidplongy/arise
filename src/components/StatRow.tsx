import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiProgression, ApiStat } from '@/lib/api';
import { STAT_META, text, withAlpha } from '@/theme';

import { XpBar } from './XpBar';

/**
 * One attribute row. The "Lv" here is the *earned difficulty tier* (see the
 * backend's progression engine) — it climbs as you show up and gently eases down
 * after a long gap, while your all-time peak stays lit. The bar shows this week's
 * progress toward the next tier.
 */
export function StatRow({ stat, prog }: { stat: ApiStat; prog?: ApiProgression }) {
  const meta = STAT_META[stat.key];
  const level = prog?.level ?? 0;
  const peak = prog?.peak ?? 0;
  const cap = prog?.cap ?? 0;
  const cleared = prog?.cleared_this_week ?? 0;
  const required = prog?.required ?? 3;
  const atCap = prog != null && level >= cap;

  // The note on the right: rebuilding toward a past high, holding at the cap, or
  // this week's progress toward the next level up.
  const note = peak > level ? `peak Lv ${peak}` : atCap ? 'maintaining' : `${cleared}/${required} this week`;

  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Ionicons name={meta.icon} size={17} color={meta.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{meta.label}</Text>
          <Text style={[styles.level, { color: meta.color }]}>Lv {level}</Text>
        </View>
        <XpBar
          value={atCap ? required : cleared}
          max={required}
          color={meta.color}
          height={4}
        />
        <View style={styles.labelRow}>
          <Text style={styles.sub}>{meta.sub}</Text>
          <Text style={styles.note}>{note}</Text>
        </View>
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
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  sub: {
    color: text.faint,
    fontSize: 11,
    flex: 1,
  },
  note: {
    color: text.secondary,
    fontSize: 11,
    marginLeft: 8,
  },
});
