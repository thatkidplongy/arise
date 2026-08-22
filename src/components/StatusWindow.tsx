import { Image, StyleSheet, View } from 'react-native';

import { Counter, SystemWindow } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import type { ApiState } from '@/lib/api';
import { STAT_META, clay, ink, radius, typography } from '@/theme';

/**
 * Who the System says you are, in its own window: the rank ring, the experience
 * bar, and all seven attributes with the counters it is measuring you by.
 *
 * This is one of the two ink surfaces Status is allowed — everything warm on the
 * screen is yours, and the window is the System talking back.
 */
export function StatusWindow({ state, avatarUri }: { state: ApiState; avatarUri?: string | null }) {
  const { player, stats, streak, today, progression } = state;

  return (
    <SystemWindow label="Status">
      <View style={styles.identity}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.ring}>
            <View pointerEvents="none" style={styles.ringInner} />
            <Text style={styles.rank}>{player.rank}</Text>
          </View>
        )}
        <View style={styles.who}>
          <Text style={styles.name}>{player.name}</Text>
          {player.equipped_title ? <Text style={styles.title}>{player.equipped_title}</Text> : null}
          <Text style={styles.meta}>
            {player.rank}-Rank Hunter · Level {player.level}
          </Text>
        </View>
      </View>

      <View style={styles.xpBlock}>
        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>Experience</Text>
          <Counter done={player.xp_into.toLocaleString()} total={player.xp_needed.toLocaleString()} color={ink.accentDim} />
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(Math.min(1, player.xp_into / Math.max(1, player.xp_needed)) * 100)}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.pills}>
        <Pill label={`STREAK ${streak.current}`} />
        <Pill label={`BEST ${streak.best}`} />
        <Pill label={`TODAY ${today.dailies_done}/${today.dailies_total}`} tone="sage" />
      </View>

      <View style={styles.hairline} />

      <View style={styles.stats}>
        {stats.map((stat) => {
          const meta = STAT_META[stat.key];
          const prog = progression?.[stat.key];
          const level = prog?.level ?? 0;
          const cleared = prog?.cleared_this_week ?? 0;
          const required = prog?.required ?? 3;
          const pct = required > 0 ? Math.min(1, cleared / required) : 0;
          return (
            <View key={stat.key} style={styles.statRow}>
              <View style={styles.statHead}>
                <Text style={styles.statKey}>{stat.key}</Text>
                <Text style={styles.statLabel}>{meta.label}</Text>
                <Text style={styles.statLevel}>Lv {level}</Text>
                <Counter done={cleared} total={required} />
              </View>
              <View style={styles.statTrack}>
                <View style={[styles.statFill, { width: `${Math.round(pct * 100)}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    </SystemWindow>
  );
}

/** A measured fact, in the face reserved for measured facts. */
function Pill({ label, tone = 'clay' }: { label: string; tone?: 'clay' | 'sage' }) {
  const sage = tone === 'sage';
  return (
    <View style={[styles.pill, sage ? { backgroundColor: ink.sageFill } : null]}>
      <Text style={[styles.pillText, { color: sage ? ink.sage : ink.accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ring: {
    width: 92,
    height: 92,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: ink.bracket,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A second hairline inside the ring — the detail that makes it read as a dial.
  ringInner: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: ink.bracketRule,
  },
  rank: { ...typography.numeral, fontSize: 36, color: ink.accent, includeFontPadding: false },
  avatar: { width: 92, height: 92, borderRadius: radius.pill, borderWidth: 2, borderColor: ink.bracket },
  who: { flex: 1, minWidth: 0, gap: 5 },
  name: { ...typography.numeral, fontSize: 26, color: ink.text, includeFontPadding: false },
  title: { ...typography.label, fontSize: 11, color: ink.accentDim },
  meta: { ...typography.small, color: ink.textDim },
  xpBlock: { gap: 9 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  xpLabel: { ...typography.kicker, fontSize: 9.5, letterSpacing: 1.9, color: ink.textDim },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: ink.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: clay[500] },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: ink.fill },
  pillText: { ...typography.mono, fontSize: 10.5, letterSpacing: 0.4 },
  hairline: { height: 1, backgroundColor: ink.rule },
  stats: { gap: 11 },
  statRow: { gap: 6 },
  statHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  statKey: { ...typography.kicker, fontSize: 10.5, letterSpacing: 1.4, color: ink.textSoft },
  statLabel: { ...typography.small, color: ink.textFaint },
  statLevel: { ...typography.numeral, fontSize: 15, marginLeft: 'auto', color: ink.accent, includeFontPadding: false },
  statTrack: { height: 3, borderRadius: radius.pill, backgroundColor: ink.track, overflow: 'hidden' },
  statFill: { height: '100%', borderRadius: radius.pill, backgroundColor: ink.accentDim },
});
