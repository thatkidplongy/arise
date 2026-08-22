import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BookPicker } from '@/components/BookPicker';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { Text, TextInput } from '@/components/ui/Text';
import { useCollapse } from '@/hooks/useCollapse';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import type { ApiReading, ApiReadingLog } from '@/lib/api';
import { countChapters, describeChaptersRead } from '@/lib/reading';
import { useSystem } from '@/store/useSystem';
import { TAP_MIN, accent, clay, feedback, onAccent, radius, sage, surface, text, typography, withAlpha } from '@/theme';

/** The book, and whether today has anything on it yet. */
function BookHead({ reading }: { reading: ApiReading }) {
  const read = reading.done_today;
  return (
    <View style={styles.head}>
      <Text style={styles.book} numberOfLines={2}>
        {reading.book}
      </Text>
      <Text style={[styles.today, { color: read ? feedback.success : text.faint }]}>
        {read ? 'Read today' : 'Not yet today'}
      </Text>
    </View>
  );
}

/** A book whose length is known: the bar is the chapters you logged against it. */
function ProgressBar({ reading }: { reading: ApiReading }) {
  const read = reading.chapters_read ?? 0; // absent until the backend service restarts
  const pct = Math.round(reading.progress * 100);
  const done = pct >= 100;
  return (
    <>
      <XpBar
        value={Math.min(read, reading.chapters)}
        max={reading.chapters}
        color={done ? feedback.success : accent}
        track={done ? sage[200] : clay[200]}
        height={12}
      />
      <Text style={styles.meta}>
        {done
          ? 'That’s the whole book by your count — the check-in will ask if you’re done.'
          : `About ${pct}% of the way, at whatever pace suits you`}
      </Text>
    </>
  );
}

/** A book whose length you never set: there's nothing to be a fraction of, so the
 * header's count stands on its own rather than a bar inventing a denominator. */
function NoLengthNote() {
  return (
    <Text style={styles.meta}>
      No length set, so there’s no bar — add the total under Change book if you want one.
    </Text>
  );
}

function Progress({ reading }: { reading: ApiReading }) {
  if (reading.measure === 'chapters') return <ProgressBar reading={reading} />;
  return <NoLengthNote />;
}

/** One sitting already logged today, with a way to take it back. */
function LoggedSitting({ entry, onRemove }: { entry: ApiReadingLog; onRemove: () => void }) {
  const count = `${entry.chapters} chapter${entry.chapters === 1 ? '' : 's'}`;
  return (
    <View style={styles.sitting}>
      <Ionicons name="bookmark-outline" size={14} color={accent} />
      <Text style={styles.sittingLabel} numberOfLines={1}>
        {entry.label || count}
      </Text>
      {entry.label ? <Text style={styles.sittingCount}>{count}</Text> : null}
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${entry.label || count}`}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

function NothingLoggedYet() {
  return <Text style={styles.empty}>Nothing logged today. Whatever you got through counts.</Text>;
}

function Sittings({ entries, onRemove }: { entries: ApiReadingLog[]; onRemove: (id: string) => void }) {
  if (!entries.length) return <NothingLoggedYet />;
  return (
    <>
      {entries.map((entry) => (
        <LoggedSitting key={entry.id} entry={entry} onRemove={() => onRemove(entry.id)} />
      ))}
    </>
  );
}

/**
 * Where you say what you actually read today — which chapters, and how many.
 *
 * The app deliberately sets no chapters-per-day target: a quota it picked turns a
 * good sitting into a failed one, and only you know what today had room for. These
 * are the numbers the progress above is made of, so log as many sittings as you
 * like — they add up.
 */
function LogToday({ reading }: { reading: ApiReading }) {
  const logReading = useSystem((s) => s.logReading);
  const removeReadingLog = useSystem((s) => s.removeReadingLog);
  const save = useSaveState();

  const [label, setLabel] = useState('');
  const [count, setCount] = useState('');
  // Once you've set a count by hand, typing more chapters shouldn't overwrite it.
  const [countEdited, setCountEdited] = useState(false);

  // A phone can be updated before the backend service is, so treat the reading-log
  // fields as absent-until-restarted rather than crashing the Status screen.
  const loggedToday = reading.logged_today ?? [];

  const chapters = countEdited ? parseInt(count, 10) || 0 : countChapters(label);
  const canLog = chapters > 0 && save.state !== 'saving';

  const onLabelChange = (next: string) => {
    setLabel(next);
    if (!countEdited) setCount(countChapters(next) > 0 ? String(countChapters(next)) : '');
  };

  const onCountChange = (next: string) => {
    setCountEdited(true);
    setCount(next.replace(/[^0-9]/g, ''));
  };

  const submit = async () => {
    if (!canLog) return;
    const landed = await save.run(() => logReading(chapters, label.trim()));
    if (!landed) return;
    setLabel('');
    setCount('');
    setCountEdited(false);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>WHAT I READ TODAY</Text>
      <Text style={styles.help}>
        However you say them — “5–7”, “12”, “the intro”. The count follows along, and there’s no
        quota: your pace is the pace.
      </Text>
      <View style={styles.row}>
        <TextInput
          value={label}
          onChangeText={onLabelChange}
          style={[styles.input, styles.grow]}
          placeholder="Chapters · e.g. 5–7"
          placeholderTextColor={text.faint}
          maxLength={120}
          onSubmitEditing={submit}
        />
        <TextInput
          value={count}
          onChangeText={onCountChange}
          style={[styles.input, styles.qty]}
          keyboardType="number-pad"
          placeholder="Qty"
          placeholderTextColor={text.faint}
          maxLength={3}
          onSubmitEditing={submit}
        />
        <Pressable
          disabled={!canLog}
          onPress={submit}
          style={({ pressed }) => [styles.btn, !canLog && styles.btnOff, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.btnText}>{saveLabel(save.state, 'Log')}</Text>
        </Pressable>
      </View>
      <Sittings entries={loggedToday} onRemove={(id) => void removeReadingLog(id)} />
    </View>
  );
}

/** Set / change the book: search Open Library, browse a shelf, or type your own. */
function ChangeBook({ current }: { current: string }) {
  const saveBook = useSystem((s) => s.saveBook);
  const save = useSaveState();

  // Drafts stay empty — they're for entering a *new* book. What you're reading now
  // is the headline above, not a pre-filled field here.
  const [title, setTitle] = useState('');
  const [chapters, setChapters] = useState('');

  const canSave = title.trim().length > 0 && save.state !== 'saving';

  const submit = async () => {
    const next = title.trim();
    if (!next) return; // never clear the current book with an empty save
    const total = Math.max(0, parseInt(chapters, 10) || 0);
    const landed = await save.run(() => saveBook(next, total));
    if (!landed) return;
    setTitle('');
    setChapters('');
  };

  return (
    <View style={styles.form}>
      <Text style={styles.help}>
        Search a title, browse a shelf, or type your own. The total chapters is only the finish
        line — leave it blank and this just counts. A book carries on for as long as it takes.
      </Text>
      <BookPicker
        onPick={(picked, guess) => {
          setTitle(picked);
          if (guess > 0) setChapters(String(guess));
        }}
      />
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[styles.input, styles.stack]}
        placeholder="e.g. Atomic Habits — James Clear"
        placeholderTextColor={text.faint}
        maxLength={120}
      />
      <View style={styles.row}>
        <TextInput
          value={chapters}
          onChangeText={(v) => setChapters(v.replace(/[^0-9]/g, ''))}
          style={[styles.input, styles.grow]}
          keyboardType="number-pad"
          placeholder="Total chapters · optional"
          placeholderTextColor={text.faint}
          maxLength={4}
        />
        <Pressable
          disabled={!canSave}
          onPress={submit}
          style={({ pressed }) => [styles.btn, !canSave && styles.btnOff, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.btnText}>{saveLabel(save.state, current ? 'Change' : 'Save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** No book yet — then the picker *is* the panel, with nothing folded away. */
function NoBookYet() {
  return (
    <SystemPanel title="Reading">
      <Text style={styles.help}>
        No book yet. Pick one and your reading daily follows it.
      </Text>
      <ChangeBook current="" />
    </SystemPanel>
  );
}

/**
 * Reading, all in one panel: where you are in the book, what you read today, and the
 * book itself.
 *
 * They were three stacked cards, which read as three separate concerns when they're
 * really one loop — the log feeds the progress, and the progress is of the book. The
 * picker is folded away because changing books is rare and its shelves are tall,
 * while logging a sitting happens daily and has to be the first thing in reach.
 */
function ReadingPanel({ reading }: { reading: ApiReading }) {
  const { open, toggle } = useCollapse(true, true);
  const read = reading.chapters_read ?? 0;

  return (
    <SystemPanel title="Reading" sub={describeChaptersRead(read, reading.chapters)}>
      <BookHead reading={reading} />
      <Progress reading={reading} />
      <LogToday reading={reading} />

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.disclose, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={text.faint} />
        <Text style={styles.discloseLabel}>Change book</Text>
        {reading.books_finished ? (
          <Text style={styles.discloseMeta}>{reading.books_finished} finished</Text>
        ) : null}
      </Pressable>
      {open ? <ChangeBook current={reading.book} /> : null}
    </SystemPanel>
  );
}

export function ReadingCard() {
  const state = useSystem((s) => s.state);
  if (!state) return null;
  if (!state.reading) return <NoBookYet />;
  return <ReadingPanel reading={state.reading} />;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  book: { ...typography.numeral, flex: 1, fontSize: 22, lineHeight: 27, includeFontPadding: false },
  today: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  meta: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 8 },

  section: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: surface.hairline },
  sectionLabel: {
    color: text.faint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  help: { color: text.secondary, fontSize: 12, lineHeight: 17, marginBottom: 10 },

  row: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: surface.base,
  },
  // minWidth 0 matters on web: an <input> carries an intrinsic min-content width, so
  // flex:1 alone won't let it shrink and the button next to it runs off the card.
  grow: { flex: 1, minWidth: 0 },
  qty: { width: 58, flexGrow: 0, flexShrink: 0, paddingHorizontal: 4, textAlign: 'center' },
  stack: { marginBottom: 8 },
  btn: {
    backgroundColor: accent,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    paddingVertical: 11,
    paddingHorizontal: 12,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOff: { backgroundColor: withAlpha(accent, 0.35) },
  btnText: { color: onAccent, fontSize: 13, fontWeight: '700' },

  sitting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 10,
    marginTop: 4,
  },
  sittingLabel: { flex: 1, color: text.primary, fontSize: 14, fontWeight: '600' },
  sittingCount: { color: text.faint, fontSize: 12 },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700' },
  empty: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 10 },

  disclose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  discloseLabel: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  discloseMeta: { color: text.faint, fontSize: 12, marginLeft: 'auto' },
  form: { marginTop: 12 },
});
