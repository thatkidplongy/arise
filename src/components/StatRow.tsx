import { StyleSheet, View } from 'react-native';

import { StatChip } from '@/components/ui/StatChip';
import { Text } from '@/components/ui/Text';
import type { ApiProgression, ApiStat } from '@/lib/api';
import { STAT_META, STAT_TINT, neutral, text, typography, withAlpha } from '@/theme';

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
      <StatChip statKey={stat.key} size={44} />
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{meta.label}</Text>
          <Text style={[styles.level, { color: meta.color }]}>Lv {level}</Text>
        </View>
        <XpBar
          value={atCap ? required : cleared}
          max={required}
          color={meta.color}
          height={6}
          track={withAlpha(meta.color, STAT_TINT)}
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
    alignItems: 'center',
    gap: 14,
    paddingVertical: 9,
  },
  body: {
    flex: 1,
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    ...typography.cardTitle,
    fontSize: 13.5,
    color: neutral[900],
  },
  level: {
    ...typography.numeral,
    fontSize: 15,
    marginLeft: 'auto',
  },
  sub: {
    ...typography.tiny,
    color: text.faint,
    flex: 1,
  },
  note: {
    ...typography.tiny,
    color: text.secondary,
    marginLeft: 8,
  },
});
