import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { useCollapse } from '@/hooks/useCollapse';
import type { ApiQuest } from '@/lib/api';
import { isWriteStep } from '@/lib/quests';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import { feedback, STAT_META, surface, text, withAlpha } from '@/theme';

/** One written reflection on a quest. Short notes show inline; long or multi-line
 * ones (the glossaries some log-steps produce) fold to a one-line preview so they
 * don't swamp the card — tap the bar to unfold, tap the text to edit, × to remove. */
function QuestNote({
  text: value,
  color,
  onEdit,
  onRemove,
}: {
  text: string;
  color: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const long = value.includes('\n') || value.length > 100;
  const { open, toggle } = useCollapse(long, long);

  if (!long) {
    return (
      <View style={styles.noteItem}>
        <Pressable style={styles.noteItemBody} onPress={onEdit}>
          <Markdown value={value} />
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
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={color} />
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
          <Markdown value={value} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function QuestCard({ quest }: { quest: ApiQuest }) {
  const complete = useSystem((s) => s.complete);
  const undo = useSystem((s) => s.undo);
  const toggleStep = useSystem((s) => s.toggleStep);
  const addQuestNote = useSystem((s) => s.addQuestNote);
  const updateQuestNote = useSystem((s) => s.updateQuestNote);
  const removeQuestNote = useSystem((s) => s.removeQuestNote);
  const [busy, setBusy] = useState(false);

  const isDone = quest.done >= quest.target;
  const canUndoToday = quest.undoable_id != null;
  // A multi-session quest with progress but not yet full: tapping the row adds
  // one, so it needs its own step-down control.
  const partialMulti = quest.target > 1 && quest.done > 0 && !isDone;
  // Single-completion quests with steps get a tickable checklist; multi-session
  // quests keep the tap-to-log flow and show their steps as guidance.
  const useChecklist = quest.target === 1 && quest.steps.length > 0;
  const meta = STAT_META[quest.stat];
  const doneCount = quest.steps_done.filter(Boolean).length;

  // How full the completion circle should read: fraction of steps ticked for a
  // checklist quest, sessions logged for a weekly one, else empty until done.
  const totalUnits = useChecklist ? quest.steps.length : quest.target;
  const doneUnits = isDone ? totalUnits : useChecklist ? doneCount : quest.done;
  const progress = totalUnits > 0 ? Math.min(doneUnits / totalUnits, 1) : 0;

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

  const inner = (
    <>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Ionicons name={meta.icon} size={17} color={meta.color} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, isDone && styles.titleDone]}>{quest.title}</Text>
        <Text style={styles.desc}>{quest.desc}</Text>

        {quest.resource && !isDone ? (
          <Text style={styles.resource}>Learn: {quest.resource}</Text>
        ) : null}

        {!isDone && quest.steps.length > 0 ? (
          <View style={styles.steps}>
            {quest.steps.map((step, i) =>
              useChecklist ? (
                <Pressable
                  key={i}
                  onPress={() => onStepPress(i)}
                  hitSlop={4}
                  style={styles.stepRow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      quest.steps_done[i]
                        ? { backgroundColor: meta.color, borderColor: meta.color }
                        : { borderColor: withAlpha(meta.color, 0.5) },
                    ]}
                  >
                    {quest.steps_done[i] ? (
                      <Ionicons name="checkmark" size={12} color={surface.card} />
                    ) : null}
                  </View>
                  <Text style={[styles.stepText, quest.steps_done[i] && styles.stepTextDone]}>
                    {step}
                  </Text>
                  {isWriteStep(step) && !quest.steps_done[i] ? (
                    <Ionicons name="create-outline" size={13} color={meta.color} style={styles.stepPen} />
                  ) : null}
                </Pressable>
              ) : (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ),
            )}
          </View>
        ) : null}

        {useChecklist && !isDone ? (
          <Text style={[styles.progress, { color: meta.color }]}>
            {doneCount} of {quest.steps.length} done
          </Text>
        ) : null}

        {quest.target > 1 ? (
          <Text style={[styles.progress, { color: meta.color }]}>
            {Math.min(quest.done, quest.target)} of {quest.target} this week
          </Text>
        ) : null}

        {/* What you wrote on this quest's write-steps — tap to edit, × to remove.
            Long notes fold to a preview so they don't swamp the card. */}
        {quest.notes.length > 0 ? (
          <View style={styles.notes}>
            {quest.notes.map((n) => (
              <QuestNote
                key={n.id}
                text={n.text}
                color={meta.color}
                onEdit={() => openEditNote(n)}
                onRemove={() => void removeQuestNote(n.id)}
              />
            ))}
          </View>
        ) : null}

        {isDone ? (
          <View style={styles.hintRow}>
            <Ionicons name="arrow-undo-outline" size={12} color={text.faint} />
            <Text style={styles.hint}>{useChecklist ? 'Tap ✓ to undo' : 'Tap to undo'}</Text>
          </View>
        ) : null}

        {partialMulti && canUndoToday ? (
          <Pressable
            onPress={requestUndo}
            hitSlop={6}
            style={({ pressed }) => [styles.stepDown, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="arrow-undo-outline" size={13} color={text.secondary} />
            <Text style={styles.stepDownText}>Undo last</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={[styles.xp, { color: meta.color }]}>+{quest.xp}</Text>
        <Pressable onPress={completeOrUndo} hitSlop={8} style={styles.checkSlot}>
          <View
            style={[
              styles.check,
              isDone && styles.checkDone,
              !isDone && { borderColor: withAlpha(meta.color, 0.5) },
            ]}
          >
            {!isDone && progress > 0 ? (
              <View
                style={[styles.checkFill, { height: 26 * progress, backgroundColor: meta.color }]}
              />
            ) : null}
            {isDone ? <Ionicons name="checkmark" size={15} color={surface.card} /> : null}
          </View>
        </Pressable>
      </View>
    </>
  );

  const modals = (
    <>
      <NoteEditorModal
        visible={noteOpen}
        prompt={notePrompt}
        initial={noteInitial}
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

  // Checklist quests aren't tap-to-complete as a whole (you tick steps or tap the
  // check); everything else keeps the whole-card tap.
  if (useChecklist) {
    return (
      <>
        <View style={[styles.card, isDone && styles.cardDone]}>{inner}</View>
        {modals}
      </>
    );
  }

  return (
    <>
      <Pressable
        onPress={completeOrUndo}
        style={({ pressed }) => [
          styles.card,
          isDone && styles.cardDone,
          pressed && { backgroundColor: withAlpha(meta.color, 0.06), borderColor: meta.color },
        ]}
      >
        {inner}
      </Pressable>
      {modals}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: surface.raised,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 11,
    padding: 12,
  },
  cardDone: {
    backgroundColor: withAlpha(feedback.success, 0.06),
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: text.secondary,
  },
  desc: {
    color: text.faint,
    fontSize: 11,
  },
  resource: {
    color: text.secondary,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 3,
  },
  steps: {
    marginTop: 7,
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingVertical: 1,
  },
  stepDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
    marginLeft: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  stepText: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  stepTextDone: {
    color: text.faint,
    textDecorationLine: 'line-through',
  },
  stepPen: { marginTop: 1 },
  progress: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  hint: {
    color: text.faint,
    fontSize: 11,
    fontWeight: '600',
  },
  stepDown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  stepDownText: {
    color: text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  notes: {
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
    gap: 7,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: withAlpha(feedback.gold, 0.07),
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  noteItemCol: { flexDirection: 'column', gap: 6 },
  noteItemBody: { flex: 1 },
  noteBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteBarTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notePreview: { flex: 1, color: text.secondary, fontSize: 12 },
  noteX: {
    color: text.faint,
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },
  right: {
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  xp: {
    fontWeight: '700',
    fontSize: 14,
  },
  checkSlot: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: text.faint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  checkFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  checkDone: {
    backgroundColor: feedback.success,
    borderColor: feedback.success,
  },
});
