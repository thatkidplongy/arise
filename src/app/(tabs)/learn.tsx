import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { CraftPhaseCard } from '@/components/CraftPhaseCard';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { ReadingCard } from '@/components/ReadingCard';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { Field, TextArea } from '@/components/ui/Field';
import { ChoiceChip, Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { useSaveState, saveLabel } from '@/hooks/useSaveState';
import { LEARNING_NOTE_MAX } from '@/consts';
import type { ApiLearning, ApiRecall, LearningKind, RecallGrade } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { STAT_META, neutral, radius, surface, text, typography, withAlpha } from '@/theme';

const KINDS: { key: LearningKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'book', label: 'Book', icon: 'book-outline' },
  { key: 'notion', label: 'Notion', icon: 'document-text-outline' },
  { key: 'article', label: 'Article', icon: 'newspaper-outline' },
  { key: 'work', label: 'Work', icon: 'briefcase-outline' },
  { key: 'video', label: 'Video', icon: 'play-circle-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const PLACEHOLDERS: Record<LearningKind, string> = {
  book: 'e.g. Atomic Habits, ch 5–6',
  notion: 'e.g. My notes on caching',
  article: 'e.g. A paper on rate limiting',
  work: 'e.g. Code review with the team',
  video: 'e.g. A talk on system design',
  other: 'What was it?',
};

const NOTE_PROMPT = 'Look away from the page — what do you remember? (in your own words, not copied)';

/** The colour Recall borrows — Grow (INT), since this is the reading attribute. */
const HUE = STAT_META.INT.color;

/** One thing you logged today, with a way to take it back. */
function LoggedRow({ entry, onRemove }: { entry: ApiLearning; onRemove: () => void }) {
  const kind = KINDS.find((k) => k.key === entry.kind) ?? KINDS[5];
  return (
    <View style={styles.row}>
      <Ionicons name={kind.icon} size={17} color={HUE} />
      <View style={styles.rowText}>
        <Text style={styles.rowSource} numberOfLines={2}>
          {entry.source || kind.label}
        </Text>
        {/* Notes are written in the editor now, so render the Markdown rather than
            showing its markers. This row has the height for it; the compact rows on
            the cards use snippet() instead. */}
        {entry.text ? <Markdown value={entry.text} color={text.secondary} /> : null}
      </View>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${entry.source}`}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

/** The note you're drafting, shown the way it will read once logged. Tapping it opens
 * the shared note editor — the same one the journal, quest reflections and craft
 * sittings use, so formatting works the same everywhere. */
function NoteDraft({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? 'Edit what you remember' : 'Write what you remember'}
      style={({ pressed }) => [styles.draft, pressed && styles.draftPressed]}
    >
      <View style={styles.draftBody}>
        {value ? <Markdown value={value} /> : <Text style={styles.draftEmpty}>{NOTE_PROMPT}</Text>}
      </View>
      <Ionicons name="create-outline" size={15} color={HUE} />
    </Pressable>
  );
}

/** What you read today, in your own words. The source alone is enough on a busy
 * day — the distiller works from a book's name. Notes make it far better, though:
 * what you wrote down is what you actually took away. */
function Capture() {
  const addLearning = useSystem((s) => s.addLearning);
  const save = useSaveState();

  const [kind, setKind] = useState<LearningKind>('book');
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  const empty = !source.trim() && !note.trim();

  const submit = async () => {
    if (empty || save.state === 'saving') return;
    const landed = await save.run(() =>
      addLearning({ kind, source: source.trim(), text: note.trim() }),
    );
    if (landed) {
      setSource('');
      setNote('');
    }
  };

  return (
    <SystemPanel title="What did you read?">
      <Text style={styles.help}>
        Anything that taught you something. Tomorrow morning it comes back to you distilled — and
        again a few days and weeks later, which is the part that makes it stick.
      </Text>

      <View style={styles.pills}>
        {KINDS.map((k) => (
          <ChoiceChip
            key={k.key}
            label={k.label}
            color={HUE}
            selected={k.key === kind}
            onPress={() => setKind(k.key)}
          />
        ))}
      </View>

      <Field
        value={source}
        onChangeText={setSource}
        style={styles.input}
        placeholder={PLACEHOLDERS[kind]}
        maxLength={200}
      />
      <NoteDraft value={note} onPress={() => setEditing(true)} />

      <NoteEditorModal
        visible={editing}
        prompt={NOTE_PROMPT}
        initial={note}
        maxLength={LEARNING_NOTE_MAX}
        onSave={(t) => {
          setEditing(false);
          setNote(t);
        }}
        onClose={() => setEditing(false)}
      />

      <Button
        label={saveLabel(save.state, 'Log it')}
        onPress={submit}
        disabled={empty}
        busy={save.state === 'saving'}
        block
        large
      />
    </SystemPanel>
  );
}

/** The three answers from the index-card method, in the order you'd sort a pile. */
const GRADES: { key: RecallGrade; label: string }[] = [
  { key: 'got', label: 'Knew it' },
  { key: 'shaky', label: 'Sort of' },
  { key: 'missed', label: 'No clue' },
];

/**
 * Grading buttons, shown only once the answer is out. Asking before you've tried
 * would just be asking you to predict yourself; the honest signal is how it felt
 * against the real answer.
 */
function GradeRow({ id }: { id: string }) {
  const gradeRecall = useSystem((s) => s.gradeRecall);
  const [done, setDone] = useState<RecallGrade | null>(null);

  if (done) {
    return (
      <Text style={styles.gradeDone}>
        {done === 'missed' ? 'Back tomorrow.' : done === 'shaky' ? 'Same spacing.' : 'Pushed further out.'}
      </Text>
    );
  }

  return (
    <View style={styles.gradeRow}>
      {GRADES.map((g) => (
        <ChoiceChip
          key={g.key}
          label={g.label}
          color={HUE}
          selected={false}
          onPress={() => {
            setDone(g.key);
            void gradeRecall(id, g.key);
          }}
        />
      ))}
    </View>
  );
}

/**
 * One question, with somewhere to put your answer before you see the real one.
 *
 * Writing it first is the whole point. Recognising an answer feels identical to
 * knowing it, which is how you can review something for weeks and still come up
 * blank when it matters. Producing the answer cold is the only thing that tells the
 * two apart — and it makes the grade afterwards evidence rather than a feeling.
 */
function RecallRow({ item }: { item: ApiRecall }) {
  const [shown, setShown] = useState(false);
  const [attempt, setAttempt] = useState('');
  const asks = Boolean(item.cue) && !shown;
  const tried = attempt.trim();

  const when = `${item.days_ago === 1 ? 'yesterday' : `${item.days_ago} days ago`}${
    item.source_label ? ` · ${item.source_label}` : ''
  }`;

  if (asks) {
    return (
      <View style={styles.recallRow}>
        <Text style={styles.recallText}>{item.cue}</Text>
        <Text style={styles.recallWhen}>{when}</Text>
        <TextArea
          style={styles.attemptInput}
          value={attempt}
          onChangeText={setAttempt}
          placeholder="Say it first, then write what you got"
        />
        <Button label="Reveal" tone="secondary" onPress={() => setShown(true)} style={styles.reveal} />
      </View>
    );
  }

  return (
    <View style={styles.recallRow}>
      {tried ? (
        <>
          <Text style={styles.attemptLabel}>You said</Text>
          <Text style={styles.attemptEcho}>{tried}</Text>
        </>
      ) : null}
      <Text style={styles.recallText}>{item.text}</Text>
      {item.hook ? <Text style={styles.recallHook}>{item.hook}</Text> : null}
      <Text style={styles.recallWhen}>{when}</Text>
      {item.cue && !tried ? (
        <Text style={styles.recallNudge}>
          Nothing written — careful, recognising this isn&apos;t the same as recalling it.
        </Text>
      ) : null}
      {item.cue ? <GradeRow id={item.id} /> : null}
    </View>
  );
}

/** Older highlights coming back around — the reason any of this works. */
function RecallPanel() {
  const recall = useSystem((s) => s.state?.recall) ?? [];
  if (!recall.length) return null;

  return (
    <SystemPanel title="Try to recall" sub={`${recall.length}`}>
      {recall.map((r) => (
        <RecallRow key={r.id} item={r} />
      ))}
    </SystemPanel>
  );
}

/**
 * The book so far, in one sentence — rewritten every sitting rather than added to.
 * Condensing a growing pile of ideas back into one line is what turns a stack of
 * notes into something you actually hold.
 */
function ThreadPanel() {
  const thread = useSystem((s) => s.state?.thread);
  if (!thread) return null;

  return (
    <SystemPanel title="The book so far">
      <Text style={styles.threadText}>{thread.summary}</Text>
      <Tag label={`${thread.title} · ${thread.days} sitting${thread.days === 1 ? '' : 's'}`} tone="sage" />
    </SystemPanel>
  );
}

export default function LearnScreen() {
  const state = useSystem((s) => s.state);
  const removeLearning = useSystem((s) => s.removeLearning);
  const learnings = state?.learnings ?? [];

  return (
    <Screen>
      <ScreenTitle>Learn</ScreenTitle>
      <ScreenBlurb>What you’re reading, and what comes back.</ScreenBlurb>

      {!state ? (
        <ConnectionPanel />
      ) : (
        <>
          {/* The two things being worked through, then everything else you read.
              Both are paced by what you log, never by a schedule. */}
          <ReadingCard />

          <CraftPhaseCard />

          <Capture />

          <SystemPanel title="Today" sub={learnings.length ? `${learnings.length}` : undefined}>
            {learnings.length ? (
              learnings.map((e) => (
                <LoggedRow key={e.id} entry={e} onRemove={() => void removeLearning(e.id)} />
              ))
            ) : (
              <Text style={styles.empty}>
                Nothing yet today. Your reading quest and any quest reflections are folded in
                automatically — this is for everything else.
              </Text>
            )}
          </SystemPanel>

          <ThreadPanel />

          <RecallPanel />

          {!state.digest_enabled ? (
            <Text style={styles.footer}>
              The morning email isn&apos;t set up yet — add a Resend key to backend/.env and it starts
              arriving. Everything you log here is kept either way.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  help: { ...typography.small, color: text.secondary, marginBottom: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 },
  input: { marginBottom: 10 },
  draft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radius.md,
    backgroundColor: surface.muted,
    paddingHorizontal: 15,
    paddingVertical: 14,
    minHeight: 96,
    marginBottom: 12,
  },
  draftPressed: { backgroundColor: withAlpha(HUE, 0.08) },
  // minWidth:0 so a long unbroken line wraps instead of pushing the pen off the row.
  draftBody: { flex: 1, minWidth: 0 },
  draftEmpty: { ...typography.body, color: text.secondary },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  rowText: { flex: 1, gap: 3 },
  rowSource: { ...typography.cardTitle, color: neutral[900] },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
  empty: { ...typography.body, color: text.secondary },
  recallRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: surface.hairline, gap: 4 },
  recallText: { ...typography.body, fontSize: 14, lineHeight: 22, color: neutral[900] },
  recallHook: { ...typography.small, color: text.secondary, fontStyle: 'italic' },
  recallWhen: { ...typography.tiny, color: text.faint },
  attemptInput: { marginTop: 10, minHeight: 72 },
  reveal: { marginTop: 10, alignSelf: 'flex-start' },
  attemptLabel: { ...typography.kicker, color: text.faint, marginBottom: 3 },
  attemptEcho: { ...typography.body, color: text.secondary, fontStyle: 'italic', marginBottom: 10 },
  recallNudge: { ...typography.small, fontSize: 11, color: text.faint, marginTop: 6 },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  gradeDone: { ...typography.small, color: text.faint, marginTop: 10 },
  threadText: { ...typography.body, fontSize: 14, lineHeight: 22, color: neutral[900] },
  footer: { ...typography.small, color: text.faint, lineHeight: 18 },
});
