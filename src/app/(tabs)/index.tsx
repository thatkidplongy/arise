import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { DailyQuote, Reminders } from '@/components/StatusCards';
import { StatusWindow } from '@/components/StatusWindow';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { IconButton } from '@/components/ui/Button';
import { Card, Kicker } from '@/components/ui/Card';
import { SectionRule } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import { dateKey } from '@/lib/dates';
import { useAvatar } from '@/query/useAvatar';
import { useSystem } from '@/store/useSystem';
import { accent, clay, feedback, neutral, radius, sage, surface, text, typography } from '@/theme';

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

/** The wordmark, and the one way through to your titles. Tracked and ruled, so the
 * page opens the way the System windows below it do. */
function Masthead() {
  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  return (
    <View style={styles.masthead}>
      <Text style={styles.wordmark}>Arise</Text>
      <View style={styles.mastheadRule} />
      <Text style={styles.weekday}>{weekday}</Text>
      <IconButton icon="sparkles-outline" label="Achievements" onPress={() => router.push('/achievements')} size={40} />
    </View>
  );
}

/** The reason behind all of this, on the one clay patch that opens the screen. */
function NorthStar({ value }: { value: string }) {
  const has = value.trim().length > 0;
  return (
    <Pressable onPress={() => router.push('/settings')} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      <Card tone="clay" style={styles.northStar}>
        <View pointerEvents="none" style={styles.northStarBlob} />
        <Kicker color={clay[700]}>Your north star</Kicker>
        {has ? (
          <Text style={styles.northStarText}>{value.trim()}</Text>
        ) : (
          <Text style={styles.northStarEmpty}>
            Write the life you’re reaching for — the reason behind all of this. Tap to set it.
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

export default function StatusScreen() {
  const state = useSystem((s) => s.state);
  const toggleRest = useSystem((s) => s.toggleRest);
  const hasAvatar = state?.player.has_avatar ?? false;
  const { uri: avatarUri } = useAvatar(hasAvatar); // query auto-loads when there's one
  const [restPending, setRestPending] = useState(false);

  if (!state) {
    return (
      <Screen>
        <Masthead />
        <ConnectionPanel />
      </Screen>
    );
  }

  const { player, streak, today, next_rank } = state;

  const onRest = async () => {
    if (restPending) return;
    setRestPending(true);
    await toggleRest();
    setRestPending(false);
  };

  return (
    <Screen>
      <Masthead />

      <NorthStar value={player.north_star} />

      {state.daily_quote ? <DailyQuote initialText={state.daily_quote.text} /> : null}

      <StatusWindow state={state} avatarUri={avatarUri} />

      <SectionRule label="The rest of today" />

      <Reminders items={state.reminders} />

      <SystemPanel
        title="Today"
        sub={
          today.resting
            ? 'Resting today'
            : today.cleared
              ? 'All of today — beautiful'
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
          height={12}
          track={today.cleared || today.resting ? sage[200] : clay[200]}
        />
        {today.resting ? (
          <Text style={styles.restNote}>Your streak is safe. Rest is part of it.</Text>
        ) : null}
      </SystemPanel>

      {/* Rest is part of the path — never a failure. An invitation, so it's dashed. */}
      <Pressable onPress={onRest} disabled={restPending}>
        <Card
          tone={today.resting ? 'sage' : 'dashed'}
          style={[styles.rest, restPending ? styles.pressed : null]}
        >
          {restPending ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <>
              <Text style={styles.restTitle}>
                {today.resting ? 'You’re resting today' : 'Take a rest day'}
              </Text>
              <Text style={styles.restSub}>
                {today.resting
                  ? 'Your streak is safe. Tap to undo.'
                  : 'Not feeling it? Rest still counts — your streak stays.'}
              </Text>
            </>
          )}
        </Card>
      </Pressable>

      {next_rank ? (
        <Card tone="sage" style={styles.gate}>
          <Kicker color={sage[700]}>Next rank</Kicker>
          <Text style={styles.gateHeading}>Rank {next_rank.rank} asks for</Text>
          <Text style={styles.gateLine}>
            Level {next_rank.level} — you’re at {player.level}
          </Text>
          <Text style={styles.gateLine}>
            A best streak of {next_rank.streak} — you’re at {streak.best}
          </Text>
        </Card>
      ) : null}

      <Text style={styles.reminder}>{reminderForToday()}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  wordmark: {
    ...typography.numeral,
    fontSize: 17,
    letterSpacing: 5.5,
    color: clay[700],
    includeFontPadding: false,
  },
  mastheadRule: { flex: 1, height: 1, backgroundColor: surface.hairline },
  weekday: { ...typography.kicker, fontSize: 9.5, letterSpacing: 2.1, color: text.secondary },
  northStar: { overflow: 'hidden', gap: 9 },
  northStarBlob: {
    position: 'absolute',
    right: -38,
    top: -38,
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: clay[200],
  },
  northStarText: {
    ...typography.numeral,
    fontSize: 20,
    lineHeight: 27,
    color: neutral[900],
  },
  northStarEmpty: {
    ...typography.body,
    color: text.onClay,
  },
  identityCard: { gap: 18 },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 18,
  },
  identity: {
    flex: 1,
    gap: 5,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: clay[400],
  },
  name: {
    ...typography.numeral,
    fontSize: 26,
    color: neutral[900],
    includeFontPadding: false,
  },
  meta: {
    ...typography.small,
    fontSize: 12,
    color: text.secondary,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  xpLabel: {
    ...typography.small,
    fontSize: 12,
    color: text.secondary,
  },
  xpValue: {
    ...typography.label,
    fontSize: 12,
    color: neutral[800],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  restNote: {
    ...typography.small,
    color: feedback.success,
    marginTop: 10,
  },
  rest: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 84,
    paddingVertical: 20,
  },
  restTitle: {
    ...typography.heading,
    color: neutral[900],
  },
  restSub: {
    ...typography.small,
    fontSize: 12,
    color: text.secondary,
    textAlign: 'center',
  },
  gate: { gap: 8 },
  gateHeading: {
    ...typography.numeral,
    fontSize: 24,
    lineHeight: 27,
    color: neutral[900],
  },
  gateLine: {
    ...typography.body,
    lineHeight: 23,
    color: sage[900],
  },
  reminder: {
    ...typography.body,
    color: text.secondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 4,
  },
});
