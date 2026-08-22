import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Counter, RewardBand, SystemWindow } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import type { ApiQuest } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { STAT_META, clay, ink, neutral, radius, sage, typography } from '@/theme';

/**
 * The one quest the System is asking for right now, given the full window
 * treatment — the shape that says *this is the System talking* without changing a
 * single colour. Everything else today stays on the warm page below it.
 *
 * A checklist quest's objectives each carry their own bracketed counter; a
 * multi-session one carries the sessions. Never a countdown, and the window says
 * out loud that missing it costs nothing.
 */
export function DailyQuestWindow({ quest }: { quest: ApiQuest }) {
  const complete = useSystem((s) => s.complete);
  const toggleStep = useSystem((s) => s.toggleStep);
  const [busy, setBusy] = useState(false);

  const meta = STAT_META[quest.stat];
  const isDone = quest.done >= quest.target;
  const useChecklist = quest.target === 1 && quest.steps.length > 0;
  const doneSteps = quest.steps_done.filter(Boolean).length;
  const units = useChecklist ? quest.steps.length : quest.target;
  const doneUnits = isDone ? units : useChecklist ? doneSteps : quest.done;
  const pct = units > 0 ? Math.min(1, doneUnits / units) : 0;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <SystemWindow label="Daily quest" tone={isDone ? 'sage' : 'clay'}>
      <View style={styles.head}>
        <Text style={styles.title}>{quest.title}</Text>
        <Text style={styles.desc}>
          {meta.label} · {quest.desc}
        </Text>
      </View>

      {useChecklist ? (
        <View style={styles.objectives}>
          {quest.steps.map((step, i) => {
            const on = quest.steps_done[i];
            return (
              <Pressable
                key={i}
                onPress={() => run(() => toggleStep(quest, i))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.objective}
              >
                <View style={[styles.dot, on ? styles.dotOn : null]}>
                  {on ? <Ionicons name="checkmark" size={12} color={neutral[900]} /> : null}
                </View>
                <Text style={[styles.objectiveText, on ? styles.objectiveDone : null]} numberOfLines={2}>
                  {step}
                </Text>
                <Counter done={on ? 1 : 0} total={1} color={on ? ink.sage : ink.textDim} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Pressable
          onPress={() => run(() => complete(quest))}
          disabled={isDone}
          accessibilityRole="button"
          style={styles.objective}
        >
          <View style={[styles.dot, isDone ? styles.dotOn : null]}>
            {isDone ? <Ionicons name="checkmark" size={12} color={neutral[900]} /> : null}
          </View>
          <Text style={[styles.objectiveText, isDone ? styles.objectiveDone : null]}>
            {isDone ? 'Logged for today' : 'Log this once you have done it'}
          </Text>
          <Counter done={doneUnits} total={quest.target} color={isDone ? ink.sage : ink.textDim} />
        </Pressable>
      )}

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>

      <RewardBand xp={quest.xp} tone={isDone ? 'sage' : 'clay'} />

      <Text style={styles.note}>
        Failure to complete carries no penalty. There is no penalty quest in this System.
      </Text>
    </SystemWindow>
  );
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  title: { ...typography.numeral, fontSize: 23, lineHeight: 27, color: ink.text },
  desc: { ...typography.small, fontSize: 12, lineHeight: 19, color: ink.textDim },
  objectives: { gap: 2 },
  objective: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  dot: {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: ink.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: sage[400], borderColor: sage[400] },
  objectiveText: { ...typography.body, fontSize: 13.5, flex: 1, minWidth: 0, color: ink.text },
  objectiveDone: { color: ink.textFaint, textDecorationLine: 'line-through' },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: ink.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: clay[500] },
  note: { ...typography.small, fontSize: 11.5, lineHeight: 19, color: ink.textDim },
});
