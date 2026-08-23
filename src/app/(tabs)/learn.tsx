import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { CraftPhaseCard } from '@/components/CraftPhaseCard';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { ReadingCard } from '@/components/ReadingCard';
import { ReadingReview } from '@/components/ReadingReview';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Card, ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { ChoiceChip, Tag } from '@/components/ui/Tag';
import { FoldToggle } from '@/components/FoldToggle';
import { Text } from '@/components/ui/Text';
import { useSaveState, saveLabel } from '@/hooks/useSaveState';
import { LEARNING_NOTE_MAX } from '@/consts';
import type { ApiLearning, ApiRecall, LearningKind, RecallGrade } from '@/lib/api';
import { buildBringBack, type BringBack } from '@/lib/bringBack';
import { describeThreadBook } from '@/lib/reading';
import { useInsights } from '@/query/useInsights';
import { useRecallLibrary } from '@/query/useRecallLibrary';
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

// The library can hand over today's own highlights, so 0 has to read as a word.
function describeAgo(daysAgo: number): string {
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  return `${daysAgo} days ago`;
}

function describeWhen(item: ApiRecall): string {
  const ago = describeAgo(item.days_ago);
  return item.source_label ? `${ago} · ${item.source_label}` : ago;
}

/**
 * One due highlight: the question, with its answer folded away underneath.
 *
 * The question stays put when the answer opens. Swapping one for the other meant you
 * couldn't check what was actually asked while looking at the answer — and comparing
 * the two is the whole reason to be here.
 */
function DueItem({ item }: { item: ApiRecall }) {
  const [open, setOpen] = useState(false);
  // Highlights distilled before cues existed have no question to ask, so there's
  // nothing to fold — they just show.
  const hasQuestion = Boolean(item.cue);

  return (
    <>
      <Text style={styles.bringText}>{hasQuestion ? item.cue : item.text}</Text>
      <Text style={styles.bringMeta}>{describeWhen(item)}</Text>
      {!hasQuestion ? null : (
        <>
          <FoldToggle
            expanded={open}
            label={open ? 'hide answer' : 'show answer'}
            color={HUE}
            onPress={() => setOpen((o) => !o)}
            accessibilityLabel={open ? 'Hide the answer' : 'Show the answer'}
            style={styles.answerFold}
          />
          {open ? (
            <>
              <Text style={styles.answerText}>{item.text}</Text>
              {item.hook ? <Text style={styles.recallHook}>{item.hook}</Text> : null}
              <GradeRow id={item.id} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}

/** One line from a tips capture. Nothing to fold and nothing to grade — it was never
 * a question, and it was never on a schedule. */
function TipItem({ tip }: { tip: Extract<BringBack, { kind: 'tip' }> }) {
  return (
    <>
      <Text style={styles.bringText}>{tip.text}</Text>
      <Text style={styles.bringMeta}>
        {tip.action ? 'to do' : 'idea'} · {tip.source}
      </Text>
    </>
  );
}

/**
 * What's come back around, at the top of the screen: one thing at a time, tap the
 * card for the next.
 *
 * The answer is a fold under the question rather than a second tap that replaces it.
 * Two reasons: the pair stays comparable, and the card's own tap keeps one meaning —
 * "next" — instead of meaning "reveal" or "next" depending on hidden state.
 *
 * Note this reveals rather than asking you to write your answer first. Quicker, at
 * the cost of the step that separates recognising something from recalling it, which
 * makes the grade afterwards a feeling rather than evidence.
 *
 * Past the due handful and the tips, tapping walks the whole library of past
 * highlights in the day's shuffled order — so a browse keeps meeting new material
 * instead of wrapping the same five questions.
 *
 * The whole card is gone on a day with nothing owed and nothing captured.
 */
function BringBackBlock() {
  const recall = useSystem((s) => s.state?.recall) ?? [];
  const { insights } = useInsights();
  const library = useRecallLibrary();
  const items = buildBringBack(recall, insights, library);
  const [at, setAt] = useState(0);

  if (!items.length) return null;
  // The list shrinks as items are graded off, so wrap rather than index past the end
  // and render an empty card.
  const current = items[at % items.length];

  return (
    <Pressable
      onPress={() => setAt((i) => (i + 1) % items.length)}
      accessibilityRole="button"
      accessibilityLabel="Show the next one"
      style={({ pressed }) => (pressed ? styles.bringPressed : null)}
    >
      {/* On a card rather than bare on the page, unlike the daily line: this one opens
          the screen, and the ivory is what makes it read as the thing to do first
          rather than a caption above the reading card.

          No edge rule either, for the same reason. A coloured rule earns its place
          when it's the only structure there is; on a card it's a second boundary
          inside the first, saying what the card already said. */}
      <Card style={styles.bringCard}>
        <Text style={styles.bringKicker}>
          {current.kind === 'tip' ? 'From your tips' : 'Try to recall'}
        </Text>
        {/* Keyed so the next question arrives with its answer folded shut, rather
            than inheriting the last one's open fold. */}
        {current.kind === 'tip' ? (
          <TipItem key={current.id} tip={current} />
        ) : (
          <DueItem key={current.id} item={current.item} />
        )}
        <Text style={styles.bringHint}>tap for another</Text>
      </Card>
    </Pressable>
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
      {/* Sittings are absent until the backend service restarts, like the reading
          card's chapter count — the book alone still reads correctly. */}
      <Tag label={describeThreadBook(thread.title, thread.sittings ?? 0)} tone="sage" />
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
          {/* First on the screen: what's due to come back beats what's new to read,
              and it's gone once the last item is graded off. */}
          <BringBackBlock />

          {/* The two things being worked through, then everything else you read.
              Both are paced by what you log, never by a schedule. */}
          <ReadingCard />

          {/* Directly under the book it asks about. It used to live on Quests, which
              meant finishing a book here showed you a line saying a check-in would
              ask — and the check-in was on another tab. It shows itself only once
              the logged chapters cover the book, so it costs nothing until then. */}
          <ReadingReview />

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
  bringPressed: { opacity: 0.85 },
  // gap 10, not the card's own 13: the spacing the edge block used to set, kept so
  // dropping the rule changed the rule and nothing else.
  bringCard: { gap: 10 },
  // The kicker's own size and tracking, which the edge block was overriding — base
  // typography.kicker is 10px at 1.6, a visibly different label.
  bringKicker: { ...typography.kicker, fontSize: 11, letterSpacing: 1.5, color: HUE },
  bringText: { ...typography.body, fontSize: 17, lineHeight: 26, color: neutral[900] },
  bringHint: { ...typography.small, color: text.secondary },
  bringMeta: { ...typography.small, color: text.secondary },
  // The answer reads back a step from the question so the pair is scannable.
  answerText: { ...typography.body, fontSize: 15, lineHeight: 23, color: text.secondary, marginTop: 6 },
  // Left-aligned, unlike the list folds this component shares — it belongs to the
  // question above it rather than to a column of rows.
  answerFold: { justifyContent: 'flex-start', minHeight: 34 },

  recallHook: { ...typography.small, color: text.secondary, fontStyle: 'italic' },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  gradeDone: { ...typography.small, color: text.faint, marginTop: 10 },
  threadText: { ...typography.body, fontSize: 14, lineHeight: 22, color: neutral[900] },
  footer: { ...typography.small, color: text.faint, lineHeight: 18 },
});
