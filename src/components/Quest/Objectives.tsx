import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Counter } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import type { ApiQuest } from '@/lib/api';
import { isWriteStep, type QuestProgress } from '@/lib/quests';
import { ink, neutral, radius, sage, typography } from '@/theme';

/** Done: one row that says so, and takes the tap that undoes it — the steps are
 * folded away, so this is the only way back. */
function LoggedRow({
  done,
  total,
  canUndo,
  onPress,
}: {
  done: number;
  total: number;
  canUndo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!canUndo}
      accessibilityRole="button"
      accessibilityLabel={canUndo ? 'Undo this quest' : undefined}
      style={styles.objective}
    >
      <View style={[styles.dot, styles.dotOn]}>
        <Ionicons name="checkmark" size={12} color={neutral[900]} />
      </View>
      <Text style={[styles.objectiveText, styles.objectiveFaint]}>
        {canUndo ? 'Logged — tap to undo' : 'Logged'}
      </Text>
      <Counter done={done} total={total} color={ink.sage} />
    </Pressable>
  );
}

/** A single-completion quest's steps: the objectives themselves, so each one ticks.
 * A write-step wears a pen, because tapping it opens the editor rather than simply
 * checking off. */
function StepChecklist({
  quest,
  ring,
  onStepPress,
}: {
  quest: ApiQuest;
  ring: string;
  onStepPress: (index: number) => void;
}) {
  return (
    <View style={styles.objectives}>
      {quest.steps.map((step, i) => {
        const on = quest.steps_done[i];
        return (
          <Pressable
            key={i}
            onPress={() => onStepPress(i)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={styles.objective}
          >
            <View style={[styles.dot, on ? styles.dotOn : { borderColor: ring }]}>
              {on ? <Ionicons name="checkmark" size={12} color={neutral[900]} /> : null}
            </View>
            <Text style={[styles.objectiveText, on && styles.objectiveDone]}>{step}</Text>
            {isWriteStep(step) && !on ? (
              <Ionicons name="create-outline" size={13} color={ink.accent} style={styles.pen} />
            ) : null}
            <Counter done={on ? 1 : 0} total={1} color={on ? ink.sage : ink.textDim} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** A multi-session quest can't tick its steps — they're what the session is, so
 * they read as guidance above the one row that logs it. */
function SessionLog({ quest, ring, onLog }: { quest: ApiQuest; ring: string; onLog: () => void }) {
  const label = quest.target > 1 ? 'Log a session' : 'Log this once you have done it';
  return (
    <View style={styles.objectives}>
      {quest.steps.map((step, i) => (
        <View key={i} style={styles.guide}>
          <View style={[styles.guideDot, { backgroundColor: ring }]} />
          <Text style={styles.guideText}>{step}</Text>
        </View>
      ))}
      <Pressable onPress={onLog} accessibilityRole="button" style={styles.objective}>
        <View style={[styles.dot, { borderColor: ring }]} />
        <Text style={styles.objectiveText}>{label}</Text>
        <Counter done={quest.done} total={quest.target} color={ink.textDim} />
      </Pressable>
    </View>
  );
}

/**
 * The middle of a quest window: whichever of the three shapes this quest takes.
 *
 * `shape` decides, and comes from `resolveQuestProgress` — so which one is drawn
 * and how full the track below it reads are two readings of the same answer,
 * rather than two conditions that could drift apart.
 */
export function Objectives({
  quest,
  shape,
  ring,
  canUndo,
  onStepPress,
  onLogOrUndo,
}: {
  quest: ApiQuest;
  shape: QuestProgress;
  ring: string;
  canUndo: boolean;
  onStepPress: (index: number) => void;
  onLogOrUndo: () => void;
}) {
  if (shape.isDone) {
    return (
      <LoggedRow done={shape.doneUnits} total={shape.totalUnits} canUndo={canUndo} onPress={onLogOrUndo} />
    );
  }
  if (shape.useChecklist) return <StepChecklist quest={quest} ring={ring} onStepPress={onStepPress} />;
  return <SessionLog quest={quest} ring={ring} onLog={onLogOrUndo} />;
}

const styles = StyleSheet.create({
  objectives: { gap: 2 },
  objective: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
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
  objectiveText: { ...typography.body, fontSize: 13, flex: 1, minWidth: 0, color: ink.text },
  objectiveDone: { color: ink.textFaint, textDecorationLine: 'line-through' },
  objectiveFaint: { color: ink.textFaint },
  pen: { marginRight: 2 },
  guide: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 26, paddingVertical: 3 },
  guideDot: { width: 5, height: 5, borderRadius: radius.pill, marginTop: 7, marginLeft: 9 },
  guideText: { ...typography.small, fontSize: 12.5, lineHeight: 19, flex: 1, minWidth: 0, color: ink.textDim },
});
