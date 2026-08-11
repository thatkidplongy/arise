import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { CraftPhaseCard } from '@/components/CraftPhaseCard';
import { CurrentBookCard } from '@/components/CurrentBookCard';
import type { ApiReading } from '@/lib/api';
import { RankBadge } from '@/components/RankBadge';
import { ReadingLogCard } from '@/components/ReadingLogCard';
import { RecallCard } from '@/components/RecallCard';
import { Screen } from '@/components/Screen';
import { StatRow } from '@/components/StatRow';
import { DailyQuote, Reminders } from '@/components/StatusCards';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { dateKey } from '@/lib/dates';
import { useAvatar } from '@/query/useAvatar';
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

/** How the progress bar is counted: the chapters you've logged when the book's
 * length is known, otherwise days of reading — there's nothing to count against a
 * book of unknown length. Never a per-day quota either way. */
function readingTally(reading: ApiReading): { label: string; value: number; max: number } {
  if (reading.measure === 'chapters') {
    const read = reading.chapters_read ?? 0; // absent until the backend service restarts
    return { label: `${read} / ${reading.chapters} chapters`, value: read, max: reading.chapters };
  }
  return { label: `${reading.days_read} / ${reading.days_to_finish} days`, value: reading.days_read, max: reading.days_to_finish };
}

/** Read-only reading progress — how far toward finishing the current book, built
 * from the chapters you logged. Logging lives just below in Today's reading, and
 * setting/changing the book below that. */
function Reading({ reading }: { reading: ApiReading }) {
  const pct = Math.round(reading.progress * 100);
  const done = pct >= 100;
  const tally = readingTally(reading);
  return (
    <SystemPanel
      title="Reading"
      sub={reading.books_finished ? `${reading.books_finished} finished` : undefined}
    >
      <Text style={styles.readingBook} numberOfLines={2}>
        {reading.book}
      </Text>
      <View style={styles.xpRow}>
        <Text style={styles.xpLabel}>Toward finishing</Text>
        <Text style={styles.xpValue}>{tally.label}</Text>
      </View>
      <XpBar
        value={Math.min(tally.value, tally.max)}
        max={tally.max}
        color={done ? feedback.success : accent}
        height={8}
      />
      <Text style={styles.readingMeta}>
        {done
          ? 'That’s the whole book by your count — the check-in will ask if you’re done.'
          : `About ${pct}% of the way, at whatever pace suits you`}
      </Text>
      <Text style={[styles.readingToday, { color: reading.done_today ? feedback.success : text.faint }]}>
        {reading.done_today ? '✓ Read today' : 'Not read yet today'}
      </Text>
    </SystemPanel>
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

  const { player, stats, streak, today, next_rank } = state;

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

      <RecallCard items={state.recall} />

      <SystemPanel>
        <View style={styles.identityRow}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <RankBadge rank={player.rank} />
          )}
          <View style={styles.identity}>
            <Text style={styles.name}>{player.name}</Text>
            {player.equipped_title ? (
              <Text style={styles.title}>{player.equipped_title}</Text>
            ) : null}
            <Text style={styles.meta}>Hunter · {player.rank}-Rank · Level {player.level}</Text>
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
          <StatRow key={stat.key} stat={stat} prog={state.progression?.[stat.key]} />
        ))}
      </SystemPanel>

      <Reminders items={state.reminders} />

      <SystemPanel
        title="Today"
        sub={
          today.resting
            ? 'Resting today 🌙'
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
          height={8}
        />
        {today.resting ? (
          <Text style={styles.restNote}>Your streak is safe. Rest is part of it.</Text>
        ) : null}
      </SystemPanel>

      {/* Rest is part of the path — never a failure. */}
      <Pressable
        onPress={onRest}
        disabled={restPending}
        style={({ pressed }) => [
          styles.rest,
          today.resting && styles.restOn,
          (pressed || restPending) && { opacity: 0.85 },
        ]}
      >
        {restPending ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <>
            <Text style={[styles.restTitle, today.resting && { color: feedback.success }]}>
              {today.resting ? 'You’re resting today 🌙' : 'Take a rest day'}
            </Text>
            <Text style={styles.restSub}>
              {today.resting
                ? 'Your streak is safe. Tap to undo.'
                : 'Not feeling it? Rest still counts — your streak stays.'}
            </Text>
          </>
        )}
      </Pressable>

      {state.reading ? <Reading reading={state.reading} /> : null}

      {/* What you read today — the only thing that moves the progress above. */}
      <ReadingLogCard />

      {/* Set / change the book you're reading — grouped with its progress above. */}
      <CurrentBookCard />

      {/* The system-design plan, paced the same way: by what you've read. */}
      <CraftPhaseCard />

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
  rest: {
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 11,
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 64,
    justifyContent: 'center',
  },
  restOn: {
    borderStyle: 'solid',
    backgroundColor: withAlpha(feedback.success, 0.06),
    borderColor: withAlpha(feedback.success, 0.4),
  },
  restTitle: {
    color: text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  restSub: {
    color: text.faint,
    fontSize: 12,
    textAlign: 'center',
  },
  readingBook: { color: text.primary, fontSize: 15, fontWeight: '700', marginBottom: 12, lineHeight: 21 },
  readingMeta: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 10 },
  readingToday: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  reminder: {
    color: text.faint,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.4),
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
