import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Objectives } from '@/components/Quest/Objectives';
import { QuestNote } from '@/components/Quest/QuestNote';
import { useNoteEditor } from '@/components/Quest/useNoteEditor';
import { RewardBand, SystemWindow } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import { QUEST_NOTE_MAX } from '@/consts';
import type { ApiQuest } from '@/lib/api';
import { isWriteStep, resolveQuestProgress } from '@/lib/quests';
import { useSystem } from '@/store/useSystem';
import { STAT_META, ink, press, radius, sage, typography } from '@/theme';

/**
 * One quest, as a System window.
 *
 * Every quest on the board wears the shape the featured one wears — espresso
 * panel, clay corner brackets, a tracked label held between hairlines, and a
 * bracketed counter on anything being measured. `featured` marks the one the
 * System is asking for right now: the same window, plus the line that says
 * missing it costs nothing.
 */
export function QuestCard({ quest, featured = false }: { quest: ApiQuest; featured?: boolean }) {
  const complete = useSystem((s) => s.complete);
  const undo = useSystem((s) => s.undo);
  const toggleStep = useSystem((s) => s.toggleStep);
  const addQuestNote = useSystem((s) => s.addQuestNote);
  const updateQuestNote = useSystem((s) => s.updateQuestNote);
  const removeQuestNote = useSystem((s) => s.removeQuestNote);
  const [busy, setBusy] = useState(false);

  const shape = resolveQuestProgress(quest);
  const { isDone, partialMulti, progress } = shape;
  const canUndoToday = quest.undoable_id != null;
  const meta = STAT_META[quest.stat];

  const tone = isDone ? 'sage' : 'clay';
  const ring = isDone ? ink.sage : ink.accentDim;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  };

  // The writing editor (a modal). Opens when you tap a "write" step, or when you
  // tap an already-saved entry to edit it.
  const editor = useNoteEditor();

  // A guard before anything that would discard a written reflection.
  const [confirm, setConfirm] = useState<{ message: string; label: string; onYes: () => void } | null>(null);

  const saveNote = async (t: string) => {
    const was = editor.editing;
    editor.close();
    if (was?.kind === 'saved') {
      void updateQuestNote(was.id, t);
      return;
    }
    if (!was) return;
    // A fresh entry written from a step: log it (with the step text as the prompt,
    // so the Journal shows what was answered), then tick that step — which may
    // complete the quest if it was the last one.
    await addQuestNote(quest.id, t, quest.steps[was.step], was.step);
    await toggleStep(quest, was.step);
  };

  // Undoing a completion removes any reflections written for it, so confirm first
  // when there's writing to lose (the server cascades the delete).
  const requestUndo = () => {
    if (busy) return;
    if (quest.notes.length > 0) {
      setConfirm({
        message: 'Undoing this also removes what you wrote for it. Undo anyway?',
        label: 'Undo & remove',
        onYes: () => run(() => undo(quest)),
      });
    } else run(() => undo(quest));
  };

  const completeOrUndo = () => {
    if (busy) return;
    if (!isDone) run(() => complete(quest));
    else if (canUndoToday) requestUndo();
  };

  // Tapping a step. A "write" step being ticked opens the editor first (saving
  // logs it and ticks the step). Unticking a write-step retracts its reflection,
  // so confirm when there's a saved note for it. Any other tap just toggles.
  const onStepPress = (i: number) => {
    const isWrite = isWriteStep(quest.steps[i]);
    if (!quest.steps_done[i] && isWrite) {
      editor.openForStep(i, quest.steps[i]);
      return;
    }
    if (quest.steps_done[i] && isWrite && quest.notes.some((n) => n.step === i)) {
      setConfirm({
        message: 'Unticking this removes what you wrote for it. Continue?',
        label: 'Untick & remove',
        onYes: () => run(() => toggleStep(quest, i)),
      });
      return;
    }
    run(() => toggleStep(quest, i));
  };

  return (
    <>
      {/* The tracked label carries the attribute, so twenty windows down a board
          don't all read "daily quest" — only the featured one says what it is. */}
      <SystemWindow
        label={featured ? 'Daily quest' : meta.label}
        tone={tone}
        style={featured ? undefined : styles.compact}
      >
        <View style={styles.head}>
          <Text style={[styles.title, featured && styles.titleBig, isDone && styles.titleDone]}>
            {quest.title}
          </Text>
          <Text style={styles.desc}>{featured ? `${meta.label} · ${quest.desc}` : quest.desc}</Text>
        </View>

        {quest.resource && !isDone ? <Text style={styles.resource}>Learn: {quest.resource}</Text> : null}

        <Objectives
          quest={quest}
          shape={shape}
          ring={ring}
          canUndo={canUndoToday}
          onStepPress={onStepPress}
          onLogOrUndo={completeOrUndo}
        />

        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(progress * 100)}%`, backgroundColor: isDone ? sage[400] : ink.accentDim },
            ]}
          />
        </View>

        {/* What you wrote on this quest's write-steps — tap to edit, × to remove. */}
        {quest.notes.length > 0 ? (
          <View style={styles.notes}>
            {quest.notes.map((n) => (
              <QuestNote
                key={n.id}
                text={n.text}
                onEdit={() => editor.openForSaved(n)}
                onRemove={() => void removeQuestNote(n.id)}
              />
            ))}
          </View>
        ) : null}

        {partialMulti && canUndoToday ? (
          <Pressable
            onPress={requestUndo}
            hitSlop={6}
            style={({ pressed }) => [styles.stepDown, pressed && { opacity: press.strong }]}
          >
            <Ionicons name="arrow-undo-outline" size={13} color={ink.textDim} />
            <Text style={styles.stepDownText}>Undo last</Text>
          </Pressable>
        ) : null}

        <RewardBand xp={quest.xp} tone={tone} />

        {featured ? (
          <Text style={styles.penalty}>
            Failure to complete carries no penalty. There is no penalty quest in this System.
          </Text>
        ) : null}
      </SystemWindow>

      <NoteEditorModal
        visible={editor.visible}
        prompt={editor.prompt}
        initial={editor.initial}
        maxLength={QUEST_NOTE_MAX}
        onSave={saveNote}
        onClose={editor.close}
      />
      <ConfirmModal
        visible={confirm != null}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label ?? 'Confirm'}
        destructive
        onConfirm={() => {
          confirm?.onYes();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // A board of windows can't wear the featured one's padding twenty times over.
  // The extra foot is the corner brackets' room: they sit 12 in from the bottom
  // edge, and without it they cut across the reward band.
  compact: { paddingTop: 18, paddingBottom: 34, paddingHorizontal: 18, gap: 13, borderRadius: 20 },
  head: { gap: 5 },
  title: { ...typography.numeral, fontSize: 18, lineHeight: 23, color: ink.text },
  titleBig: { fontSize: 23, lineHeight: 27 },
  titleDone: { color: ink.textFaint, textDecorationLine: 'line-through' },
  desc: { ...typography.small, fontSize: 11.5, lineHeight: 18, color: ink.textDim },
  resource: {
    ...typography.tiny,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: ink.fill,
    color: ink.textDim,
  },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: ink.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  notes: { gap: 8 },
  stepDown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ink.rule,
    borderRadius: radius.pill,
  },
  stepDownText: { ...typography.label, fontSize: 12, color: ink.textDim },
  penalty: { ...typography.small, fontSize: 11.5, lineHeight: 19, color: ink.textDim },
});
