import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { RankBadge } from '@/components/RankBadge';
import { Screen } from '@/components/Screen';
import { StatRow } from '@/components/StatRow';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { dateKey } from '@/lib/dates';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text, withAlpha } from '@/theme';

// Quiet reminders — that rest and living are part of the path, not a detour.
const REMINDERS = [
  'Rest is part of the work. So is joy.',
  'Small and steady beats fast and forced.',
  'You don’t have to do it all. Show up how you can.',
  'Discipline is just kindness to your future self.',
  'Go live your life today — that counts too.',
  'One small thing is enough.',
  'Progress, not perfection.',
  'Be someone you’d be glad to see in the mirror.',
];

function reminderForToday(): string {
  const key = dateKey();
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return REMINDERS[sum % REMINDERS.length];
}

function Masthead() {
  return (
    <View style={styles.masthead}>
      <Text style={styles.wordmark}>Arise</Text>
      <View style={styles.rule} />
      <Text style={styles.tagline}>rise beyond your limits</Text>
    </View>
  );
}

function NorthStar({ value }: { value: string }) {
  const has = value.trim().length > 0;
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.northStar, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.northStarHead}>
        <Ionicons name="compass-outline" size={14} color={accent} />
        <Text style={styles.northStarLabel}>YOUR NORTH STAR</Text>
      </View>
      {has ? (
        <Text style={styles.northStarText}>{value.trim()}</Text>
      ) : (
        <Text style={styles.northStarEmpty}>
          Write the life you’re reaching for — the reason behind all of this. Tap to set it.
        </Text>
      )}
    </Pressable>
  );
}

export default function StatusScreen() {
  const state = useSystem((s) => s.state);

  if (!state) {
    return (
      <Screen>
        <Masthead />
        <ConnectionPanel />
      </Screen>
    );
  }

  const { player, stats, streak, today, next_rank } = state;

  return (
    <Screen>
      <Masthead />

      <NorthStar value={player.north_star} />

      <SystemPanel>
        <View style={styles.identityRow}>
          <RankBadge rank={player.rank} />
          <View style={styles.identity}>
            <Text style={styles.name}>{player.name}</Text>
            {player.equipped_title ? (
              <Text style={styles.title}>{player.equipped_title}</Text>
            ) : null}
            <Text style={styles.meta}>Hunter · Level {player.level}</Text>
          </View>
        </View>

        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>Experience</Text>
          <Text style={styles.xpValue}>
            {player.xp_into.toLocaleString()} / {player.xp_needed.toLocaleString()}
          </Text>
        </View>
        <XpBar value={player.xp_into} max={player.xp_needed} height={8} />

        <View style={styles.chips}>
          <View style={styles.chip}>
            <Ionicons name="flame-outline" size={14} color={feedback.gold} />
            <Text style={styles.chipText}>{streak.current} day streak</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="ribbon-outline" size={14} color={accent} />
            <Text style={styles.chipText}>best {streak.best}</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="add-circle-outline" size={14} color={feedback.success} />
            <Text style={styles.chipText}>{today.xp} XP today</Text>
          </View>
        </View>
      </SystemPanel>

      <SystemPanel title="Attributes">
        {stats.map((stat) => (
          <StatRow key={stat.key} stat={stat} />
        ))}
      </SystemPanel>

      <SystemPanel
        title="Today"
        sub={
          today.resting
            ? 'Resting today 🌙'
            : today.cleared
              ? 'All five today — beautiful'
              : 'Whatever you manage counts'
        }
      >
        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>Daily quests</Text>
          <Text style={styles.xpValue}>
            {today.dailies_done} / {today.dailies_total}
          </Text>
        </View>
        <XpBar
          value={today.resting ? today.dailies_total : today.dailies_done}
          max={today.dailies_total}
          color={today.cleared || today.resting ? feedback.success : accent}
          height={8}
        />
        {today.resting ? (
          <Text style={styles.restNote}>Your streak is safe. Rest is part of it.</Text>
        ) : null}
      </SystemPanel>

      {next_rank ? (
        <SystemPanel title="Next rank">
          <Text style={styles.gateHeading}>Rank {next_rank.rank} requires</Text>
          <Text style={styles.gateLine}>
            Level {next_rank.level} <Text style={styles.gateNow}>(now {player.level})</Text>
          </Text>
          <Text style={styles.gateLine}>
            Best streak of {next_rank.streak} days{' '}
            <Text style={styles.gateNow}>(now {streak.best})</Text>
          </Text>
        </SystemPanel>
      ) : null}

      <Text style={styles.reminder}>{reminderForToday()}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  masthead: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    gap: 8,
  },
  wordmark: {
    color: accent,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 5,
    paddingLeft: 5, // balance the trailing letter-spacing so it reads centered
  },
  rule: {
    width: 30,
    height: 2,
    borderRadius: 1,
    backgroundColor: withAlpha(accent, 0.45),
  },
  tagline: {
    color: text.secondary,
    fontSize: 12,
    letterSpacing: 1,
  },
  northStar: {
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.35),
    borderLeftWidth: 3,
    borderLeftColor: accent,
    borderRadius: 11,
    padding: 14,
    gap: 8,
  },
  northStarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  northStarLabel: {
    color: accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  northStarText: {
    color: text.primary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  northStarEmpty: {
    color: text.secondary,
    fontSize: 13,
    lineHeight: 20,
  },
  restNote: {
    color: feedback.success,
    fontSize: 12,
    marginTop: 10,
  },
  reminder: {
    color: text.faint,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: text.primary,
    fontSize: 22,
    fontWeight: '700',
  },
  title: {
    color: accent,
    fontSize: 13,
    fontWeight: '600',
  },
  meta: {
    color: text.secondary,
    fontSize: 13,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  xpLabel: {
    color: text.secondary,
    fontSize: 12,
  },
  xpValue: {
    color: text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: surface.raised,
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  chipText: {
    color: text.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  gateHeading: {
    color: text.primary,
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 6,
  },
  gateLine: {
    color: text.primary,
    fontSize: 13,
    lineHeight: 22,
  },
  gateNow: {
    color: text.secondary,
  },
});
