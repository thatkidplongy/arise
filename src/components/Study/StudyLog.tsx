import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { StudyButton } from '@/components/Study/StudyButton';
import { Text } from '@/components/ui/Text';
import { LEARNING_NOTE_MAX } from '@/consts';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import type { ApiLearning, ApiStudy } from '@/lib/api';
import { isSittingFor, openPieceOf, studyKindOf } from '@/lib/study';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import { radius, surface, text, withAlpha } from '@/theme';

const STUDY_PROMPT = 'In your own words — what did you take away?';

/** One sitting already logged today, with a way to take it back. */
function StudiedRow({ entry, hue, onRemove }: { entry: ApiLearning; hue: string; onRemove: () => void }) {
  return (
    <View style={styles.sitting}>
      <Ionicons name="bookmark-outline" size={14} color={hue} />
      {/* One line of plain text: the note is Markdown now, so the raw markers
          would otherwise show through on this compact row. */}
      <Text style={styles.sittingLabel} numberOfLines={2}>
        {snippet(entry.text) || entry.source}
      </Text>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove this sitting">
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

function NothingStudiedYet() {
  return <Text style={styles.empty}>Nothing logged today. Whatever you got through counts.</Text>;
}

/** The sitting you're drafting, shown the way it will read once logged. Tapping it
 * opens the shared note editor — the same one the journal and quest reflections
 * use, so formatting works the same everywhere. */
function StudyDraft({ value, hue, onPress }: { value: string; hue: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? 'Edit what you studied' : 'Write what you studied'}
      style={({ pressed }) => [
        styles.draft,
        pressed && { borderColor: hue, backgroundColor: withAlpha(hue, 0.05) },
      ]}
    >
      <View style={styles.draftBody}>
        {value ? <Markdown value={value} /> : <Text style={styles.draftEmpty}>{STUDY_PROMPT}</Text>}
      </View>
      <Ionicons name="create-outline" size={15} color={hue} />
    </Pressable>
  );
}

/** How a sitting is worded, the one line the subjects say differently: Craft's is a
 * page you close, a walk's is an exercise you just did. */
function StudyHelp({ study }: { study: ApiStudy }) {
  if (study.subject === 'craft') {
    return (
      <Text style={styles.help}>
        Close the page and say the idea back. One sitting is one piece of the phase, at
        whatever pace suits you.
      </Text>
    );
  }
  return (
    <Text style={styles.help}>
      Put the pencil down and say what you noticed. Logging it is what brings it back to
      you later — the step itself moves when you say you’re through it.
    </Text>
  );
}

/**
 * What you took away from today's sitting — the Craft equivalent of logging which
 * chapters you read, and the same thing for a kana row or a drawing exercise.
 *
 * It asks for the idea rather than a page number on purpose: a Notion page has no
 * chapter count, a contour drawing has no chapters at all, and what you can say back
 * is the only honest measure of having done it. Written in your own words, never
 * copy-pasted, so it also feeds tomorrow morning's recall.
 */
export function StudyLog({ study, hue }: { study: ApiStudy; hue: string }) {
  const addLearning = useSystem((s) => s.addLearning);
  const removeLearning = useSystem((s) => s.removeLearning);
  // `?? []` outside the selector: inside, a null state hands the store a fresh array
  // on every read and the render loops.
  const learnings = useSystem((s) => s.state?.learnings) ?? [];
  const save = useSaveState();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  const today = learnings.filter((l) => isSittingFor(l, study));
  const canLog = note.trim().length > 0 && save.state !== 'saving';

  const submit = async () => {
    if (!canLog) return;
    const landed = await save.run(() =>
      addLearning({ kind: studyKindOf(study), source: openPieceOf(study), text: note.trim() }),
    );
    if (landed) setNote('');
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>WHAT I STUDIED TODAY</Text>
      <StudyHelp study={study} />
      <StudyDraft value={note} hue={hue} onPress={() => setEditing(true)} />
      <StudyButton
        label={saveLabel(save.state, 'Log what I studied')}
        hue={hue}
        disabled={!canLog}
        onPress={() => void submit()}
      />

      <NoteEditorModal
        visible={editing}
        prompt={STUDY_PROMPT}
        initial={note}
        maxLength={LEARNING_NOTE_MAX}
        onSave={(t) => {
          setEditing(false);
          setNote(t);
        }}
        onClose={() => setEditing(false)}
      />

      {today.length ? (
        today.map((entry) => (
          <StudiedRow
            key={entry.id}
            entry={entry}
            hue={hue}
            onRemove={() => void removeLearning(entry.id)}
          />
        ))
      ) : (
        <NothingStudiedYet />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: surface.hairline },
  sectionLabel: {
    color: text.faint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  help: { color: text.secondary, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  draft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.md,
    backgroundColor: surface.base,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 76,
    marginBottom: 8,
  },
  // minWidth:0 so a long unbroken line wraps instead of pushing the pen off the row.
  draftBody: { flex: 1, minWidth: 0 },
  draftEmpty: { color: text.faint, fontSize: 14, lineHeight: 20 },
  sitting: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  sittingLabel: { flex: 1, color: text.primary, fontSize: 13, lineHeight: 19 },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -3 },
  empty: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 10 },
});
