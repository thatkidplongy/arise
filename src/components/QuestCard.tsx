import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countThisWeek, countToday } from '@/lib/selectors';
import { useSystem } from '@/store/useSystem';
import { colors, STAT_META, withAlpha } from '@/theme';
import type { QuestDef } from '@/types';

export function QuestCard({ quest }: { quest: QuestDef }) {
  const log = useSystem((s) => s.log);
  const completeQuest = useSystem((s) => s.completeQuest);
  const undoQuest = useSystem((s) => s.undoQuest);

  const done =
    quest.cadence === 'weekly' ? countThisWeek(log, quest.id) : countToday(log, quest.id);
  const complete = done >= quest.target;
  const undoable = countToday(log, quest.id) > 0;
  const meta = STAT_META[quest.stat];

  return (
    <Pressable
      disabled={complete}
      onPress={() => completeQuest(quest.id)}
      style={({ pressed }) => [
        styles.card,
        complete && styles.cardDone,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, complete && styles.titleDone]}>{quest.title}</Text>
        <Text style={styles.desc}>{quest.desc}</Text>
        {quest.target > 1 ? (
          <Text style={styles.progress}>
            {Math.min(done, quest.target)}/{quest.target} this week
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={[styles.xp, { color: meta.color }]}>+{quest.xp}</Text>
        <View style={[styles.check, complete && styles.checkDone]}>
          {complete ? <Ionicons name="checkmark" size={14} color={colors.bg} /> : null}
        </View>
        {complete && undoable ? (
          <Pressable hitSlop={8} onPress={() => undoQuest(quest.id)}>
            <Text style={styles.undo}>UNDO</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(77, 166, 255, 0.12)',
    borderRadius: 8,
    padding: 12,
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: withAlpha(colors.primary, 0.08),
  },
  cardDone: {
    opacity: 0.6,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: colors.textDim,
  },
  desc: {
    color: colors.textDim,
    fontSize: 11,
  },
  progress: {
    color: colors.primaryBright,
    fontSize: 11,
    fontWeight: '600',
  },
  right: {
    alignItems: 'center',
    gap: 4,
  },
  xp: {
    fontWeight: '800',
    fontSize: 13,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  undo: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
