import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Counter, RewardBand, SystemWindow } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import { QUEST_NOTE_MAX } from '@/consts';
import { useCollapse } from '@/hooks/useCollapse';
import type { ApiQuest } from '@/lib/api';
import { isWriteStep } from '@/lib/quests';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import { STAT_META, ink, neutral, radius, sage, typography } from '@/theme';

/** One written reflection on a quest. Short notes show inline; long or multi-line
 * ones (the glossaries some log-steps produce) fold to a one-line preview so they
 * don't swamp the window — tap the bar to unfold, tap the text to edit, × to remove. */
function QuestNote({
  text: value,
  onEdit,
  onRemove,
}: {
  text: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const long = value.includes('\n') || value.length > 100;
  const { open, toggle } = useCollapse(long, long);

  if (!long) {
    return (
      <View style={styles.noteItem}>
        <Pressable style={styles.noteItemBody} onPress={onEdit}>
          <Markdown value={value} color={ink.text} />
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.noteX}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.noteItem, styles.noteItemCol]}>
      <View style={styles.noteBar}>
        <Pressable style={styles.noteBarTap} onPress={toggle} hitSlop={4}>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={ink.textDim} />
          <Text style={styles.notePreview} numberOfLines={1}>
            {open ? 'Your note' : snippet(value)}
          </Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.noteX}>×</Text>
        </Pressable>
      </View>
      {open ? (
        <Pressable onPress={onEdit}>
          <Markdown value={value} color={ink.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

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

  const isDone = quest.done >= quest.target;
  const canUndoToday = quest.undoable_id != null;
  // A multi-session quest with progress but not yet full: the log row adds one,
  // so it needs its own step-down control.
  const partialMulti = quest.target > 1 && quest.done > 0 && !isDone;
  // Single-completion quests with steps get a tickable checklist; multi-session
  // quests keep the tap-to-log flow and show their steps as guidance.
  const useChecklist = quest.target === 1 && quest.steps.length > 0;
  const meta = STAT_META[quest.stat];
  const doneCount = quest.steps_done.filter(Boolean).length;

  // How full the window's track reads: fraction of steps ticked for a checklist
  // quest, sessions logged for a multi-session one, else empty until done.
  const totalUnits = useChecklist ? quest.steps.length : quest.target;
  const doneUnits = isDone ? totalUnits : useChecklist ? doneCount : quest.done;
  const progress = totalUnits > 0 ? Math.min(doneUnits / totalUnits, 1) : 0;

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
  const [noteOpen, setNoteOpen] = useState(false);
  const [notePrompt, setNotePrompt] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteInitial, setNoteInitial] = useState('');
  const [pendingStep, setPendingStep] = useState<number | null>(null);

  // A guard before anything that would discard a written reflection.
  const [confirm, setConfirm] = useState<{ message: string; label: string; onYes: () => void } | null>(null);

  const openEditNote = (n: { id: string; text: string }) => {
    setPendingStep(null);
    setEditingNoteId(n.id);
    setNoteInitial(n.text);
    setNotePrompt('Edit your entry');
    setNoteOpen(true);
  };

  const saveNote = async (t: string) => {
    setNoteOpen(false);
    if (editingNoteId) {
      void updateQuestNote(editingNoteId, t);
      return;
    }
    // A fresh entry written from a step: log it (with the step text as the prompt,
    // so the Journal shows what was answered), then tick that step — which may
    // complete the quest if it was the last one.
    const step = pendingStep;
    setPendingStep(null);
    await addQuestNote(quest.id, t, step != null ? quest.steps[step] : notePrompt, step);
    if (step != null) await toggleStep(quest, step);
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
      setEditingNoteId(null);
      setNoteInitial('');
      setNotePrompt(quest.steps[i]);
      setPendingStep(i);
      setNoteOpen(true);
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

  const logLabel = quest.target > 1 ? 'Log a session' : 'Log this once you have done it';

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

        {/* Done: one row that says so, and takes the tap that undoes it — the steps
            are folded away, so this is the only way back. */}
        {isDone ? (
          <Pressable
            onPress={completeOrUndo}
            disabled={!canUndoToday}
            accessibilityRole="button"
            accessibilityLabel={canUndoToday ? 'Undo this quest' : undefined}
            style={styles.objective}
          >
            <View style={[styles.dot, styles.dotOn]}>
              <Ionicons name="checkmark" size={12} color={neutral[900]} />
            </View>
            <Text style={[styles.objectiveText, styles.objectiveFaint]}>
              {canUndoToday ? 'Logged — tap to undo' : 'Logged'}
            </Text>
            <Counter done={doneUnits} total={totalUnits} color={ink.sage} />
          </Pressable>
        ) : useChecklist ? (
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
        ) : (
          <View style={styles.objectives}>
            {/* A multi-session quest can't tick its steps — they're what the session
                is, so they read as guidance above the one row that logs it. */}
            {quest.steps.map((step, i) => (
              <View key={i} style={styles.guide}>
                <View style={[styles.guideDot, { backgroundColor: ring }]} />
                <Text style={styles.guideText}>{step}</Text>
              </View>
            ))}
            <Pressable onPress={completeOrUndo} accessibilityRole="button" style={styles.objective}>
              <View style={[styles.dot, { borderColor: ring }]} />
              <Text style={styles.objectiveText}>{logLabel}</Text>
              <Counter done={quest.done} total={quest.target} color={ink.textDim} />
            </Pressable>
          </View>
        )}

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
                onEdit={() => openEditNote(n)}
                onRemove={() => void removeQuestNote(n.id)}
              />
            ))}
          </View>
        ) : null}

        {partialMulti && canUndoToday ? (
          <Pressable
            onPress={requestUndo}
            hitSlop={6}
            style={({ pressed }) => [styles.stepDown, pressed && { opacity: 0.6 }]}
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
        visible={noteOpen}
        prompt={notePrompt}
        initial={noteInitial}
        maxLength={QUEST_NOTE_MAX}
        onSave={saveNote}
        onClose={() => setNoteOpen(false)}
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
  track: { height: 5, borderRadius: radius.pill, backgroundColor: ink.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  notes: { gap: 8 },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: ink.fill,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
    overflow: 'hidden', // clip any stray horizontal spill from a long note line
  },
  noteItemCol: { flexDirection: 'column', gap: 6 },
  noteItemBody: { flex: 1, minWidth: 0 },
  noteBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteBarTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notePreview: { ...typography.small, fontSize: 12, flex: 1, minWidth: 0, color: ink.textDim },
  noteX: { color: ink.textFaint, fontSize: 18, fontWeight: '700', marginTop: -2 },
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
