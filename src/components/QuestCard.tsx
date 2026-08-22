import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { StatChip } from '@/components/ui/StatChip';
import { Text } from '@/components/ui/Text';
import { QUEST_NOTE_MAX } from '@/consts';
import { useCollapse } from '@/hooks/useCollapse';
import type { ApiQuest } from '@/lib/api';
import { isWriteStep } from '@/lib/quests';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import { STAT_META, clay, neutral, radius, sage, surface, text, typography, withAlpha } from '@/theme';

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
      <StatChip statKey={quest.stat} size={40} style={styles.disc} />

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
                      <Ionicons name="checkmark" size={13} color={neutral[100]} />
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
            <Text style={styles.hint}>{useChecklist ? 'Tap the circle to undo' : 'Tap to undo'}</Text>
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
        <Text style={[styles.xp, { color: meta.color }]}>{quest.xp}</Text>
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
                style={[styles.checkFill, { height: 32 * progress, backgroundColor: meta.color }]}
              />
            ) : null}
            {isDone ? <Ionicons name="checkmark" size={17} color={neutral[100]} /> : null}
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
          pressed && { backgroundColor: withAlpha(meta.color, 0.07), borderColor: meta.color },
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
    gap: 13,
    alignItems: 'flex-start',
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.md,
    padding: 15,
  },
  // Done is sage, never green-means-go: a finished quest is safe, not urgent.
  cardDone: {
    backgroundColor: 'rgba(143, 160, 115, 0.12)',
    borderColor: 'rgba(114, 129, 87, 0.4)',
  },
  disc: { marginTop: 1 },
  body: {
    flex: 1,
    // On web, a flex child won't shrink below its content unless minWidth is 0 —
    // without this, a wide note line spills over the XP / check column.
    minWidth: 0,
    gap: 3,
  },
  title: {
    ...typography.cardTitle,
    lineHeight: 19,
    color: neutral[900],
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: text.secondary,
  },
  desc: {
    ...typography.small,
    fontSize: 11,
    lineHeight: 16,
    color: text.secondary,
  },
  resource: {
    ...typography.tiny,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: neutral[200],
    color: text.secondary,
  },
  steps: {
    marginTop: 8,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    minHeight: 26,
  },
  stepDot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    marginTop: 8,
    marginLeft: 8,
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    ...typography.small,
    fontSize: 12.5,
    lineHeight: 19,
    color: neutral[800],
    flex: 1,
  },
  stepTextDone: {
    color: text.faint,
    textDecorationLine: 'line-through',
  },
  stepPen: { marginTop: 3 },
  progress: {
    ...typography.label,
    fontSize: 11.5,
    marginTop: 7,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  hint: {
    ...typography.tiny,
    color: text.faint,
  },
  stepDown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 9,
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: surface.edge,
    borderRadius: radius.pill,
  },
  stepDownText: {
    ...typography.label,
    fontSize: 12,
    color: text.secondary,
  },
  notes: {
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
    gap: 8,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: clay[100],
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
    overflow: 'hidden', // clip any stray horizontal spill from a long note line
  },
  noteItemCol: { flexDirection: 'column', gap: 6 },
  noteItemBody: { flex: 1, minWidth: 0 },
  noteBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteBarTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notePreview: { ...typography.small, fontSize: 12, flex: 1, minWidth: 0, color: text.secondary },
  noteX: {
    color: text.faint,
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },
  right: {
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  xp: {
    ...typography.numeral,
    fontSize: 15,
    includeFontPadding: false,
  },
  checkSlot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: surface.edge,
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
    backgroundColor: sage[600],
    borderColor: sage[600],
  },
});
