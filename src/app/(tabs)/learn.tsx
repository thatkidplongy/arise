import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { useSaveState, saveLabel } from '@/hooks/useSaveState';
import type { ApiLearning, ApiRecall, LearningKind, RecallGrade } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { accent, onAccent, STAT_META, surface, text, withAlpha } from '@/theme';

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
        {entry.text ? (
          <Text style={styles.rowNote} numberOfLines={3}>
            {entry.text}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${entry.source}`}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
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
        {KINDS.map((k) => {
          const on = k.key === kind;
          return (
            <Pressable
              key={k.key}
              onPress={() => setKind(k.key)}
              style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name={k.icon} size={14} color={on ? onAccent : HUE} />
              <Text style={[styles.pillText, { color: on ? onAccent : HUE }]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={source}
        onChangeText={setSource}
        style={styles.input}
        placeholder={PLACEHOLDERS[kind]}
        placeholderTextColor={text.faint}
        maxLength={200}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        style={[styles.input, styles.multiline]}
        placeholder="Look away from the page — what do you remember? (in your own words, not copied)"
        placeholderTextColor={text.faint}
        multiline
        maxLength={4000}
      />

      <Pressable
        disabled={empty || save.state === 'saving'}
        onPress={submit}
        style={({ pressed }) => [
          styles.btn,
          empty && styles.btnOff,
          (pressed || save.state === 'saving') && { opacity: 0.8 },
        ]}
      >
        <Text style={styles.btnText}>{saveLabel(save.state, 'Log it')}</Text>
      </Pressable>
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
        <Pressable
          key={g.key}
          onPress={() => {
            setDone(g.key);
            void gradeRecall(id, g.key);
          }}
          style={({ pressed }) => [styles.gradeBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.gradeText}>{g.label}</Text>
        </Pressable>
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
        <TextInput
          style={styles.attemptInput}
          value={attempt}
          onChangeText={setAttempt}
          placeholder="Say it first, then write what you got"
          placeholderTextColor={text.faint}
          multiline
        />
        <Pressable
          onPress={() => setShown(true)}
          style={({ pressed }) => [styles.revealBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.revealText}>Reveal</Text>
        </Pressable>
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
      <Text style={styles.threadMeta}>
        {thread.title} · {thread.days} sitting{thread.days === 1 ? '' : 's'}
      </Text>
    </SystemPanel>
  );
}

export default function LearnScreen() {
  const state = useSystem((s) => s.state);
  const removeLearning = useSystem((s) => s.removeLearning);
  const learnings = state?.learnings ?? [];

  return (
    <Screen>
      <BackLink />
      <View style={styles.head}>
        <Text style={styles.h1}>Learn</Text>
        <Text style={styles.sub}>Log what you read. Get it back when it counts.</Text>
      </View>

      {!state ? (
        <ConnectionPanel />
      ) : (
        <>
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
  head: { gap: 4, marginBottom: 2 },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: withAlpha(HUE, 0.5),
    backgroundColor: withAlpha(HUE, 0.08),
  },
  pillOn: { backgroundColor: HUE, borderColor: HUE },
  pillText: { fontSize: 13, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: text.primary,
    fontSize: 14,
    marginBottom: 10,
  },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  btn: {
    backgroundColor: accent,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 2,
  },
  btnOff: { backgroundColor: withAlpha(accent, 0.35) },
  btnText: { color: onAccent, fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  rowText: { flex: 1, gap: 3 },
  rowSource: { color: text.primary, fontSize: 14, fontWeight: '600' },
  rowNote: { color: text.secondary, fontSize: 12, lineHeight: 17 },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  recallRow: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: surface.hairline, gap: 3 },
  recallText: { color: text.primary, fontSize: 14, lineHeight: 20 },
  recallHook: { color: text.secondary, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  attemptInput: {
    marginTop: 10,
    minHeight: 54,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: text.primary,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  revealBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: withAlpha(STAT_META.INT.color, 0.14),
  },
  revealText: { color: STAT_META.INT.color, fontSize: 12, fontWeight: '700' },
  attemptLabel: {
    color: text.faint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  attemptEcho: {
    color: text.secondary,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  recallNudge: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 6 },
  gradeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  gradeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: surface.hairline,
    backgroundColor: withAlpha(STAT_META.INT.color, 0.07),
  },
  gradeText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  gradeDone: { color: text.faint, fontSize: 11, marginTop: 10 },
  threadText: { color: text.primary, fontSize: 14, lineHeight: 21 },
  threadMeta: { color: text.faint, fontSize: 11, marginTop: 6 },
  recallWhen: { color: text.faint, fontSize: 11 },
  footer: { color: text.faint, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});
