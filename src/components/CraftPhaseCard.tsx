import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { Text, TextInput } from '@/components/ui/Text';
import { LEARNING_NOTE_MAX } from '@/consts';
import { useCollapse } from '@/hooks/useCollapse';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import type { ApiCraft, ApiLearning } from '@/lib/api';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import { STAT_META, TAP_MIN, feedback, onAccent, radius, surface, text, withAlpha } from '@/theme';

/** Craft's colour — this is the coding/architecture attribute. */
const HUE = STAT_META.CFT.color;

/**
 * The phase check-in: "have you read this phase's material?"
 *
 * Shown only once the pages you've logged cover the phase, and at most once a week.
 * Yes moves you on, not yet holds — no penalty either way, and nothing expires.
 */
function PhaseReview({ label }: { label: string }) {
  const reviewCraftPhase = useSystem((s) => s.reviewCraftPhase);

  return (
    <View style={styles.review}>
      <Text style={styles.reviewBody}>
        You’ve logged enough to cover {label}. Ready for the next phase?
      </Text>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.85 }]}
          onPress={() => void reviewCraftPhase(true)}
        >
          <Text style={styles.primaryText}>Yes, move on</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
          onPress={() => void reviewCraftPhase(false)}
        >
          <Text style={styles.btnText}>Not yet</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PhaseProgress({ craft }: { craft: ApiCraft }) {
  const covered = craft.done >= craft.pieces;
  return (
    <>
      <View style={styles.tallyRow}>
        <Text style={styles.tallyLabel}>Covered in this phase</Text>
        <Text style={styles.tallyValue}>
          {craft.done} / {craft.pieces}
        </Text>
      </View>
      <XpBar
        value={Math.min(craft.done, craft.pieces)}
        max={craft.pieces}
        color={covered ? feedback.success : HUE}
        height={8}
      />
      <Text style={styles.meta}>
        {craft.is_last
          ? 'The last phase — design reps carry on for as long as you want them to.'
          : 'This phase holds until you say it’s read. Nothing here is on a clock.'}
      </Text>
    </>
  );
}

/** What's coming once you log this one — logging is what moves you on, so there's no
 * separate button to press. */
function UpNext({ next }: { next: string }) {
  if (!next) return null;
  return <Text style={styles.nowNext}>Log this one and you’re on to {next}</Text>;
}

/** Steps back to the piece before this one — for a chapter that wants a second
 * sitting, or a log you didn't mean to move you on. */
function UndoTick() {
  const finishCraftPiece = useSystem((s) => s.finishCraftPiece);
  return (
    <Pressable
      onPress={() => void finishCraftPiece(false)}
      hitSlop={6}
      style={({ pressed }) => [styles.undo, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="arrow-undo-outline" size={12} color={text.secondary} />
      <Text style={styles.undoText}>Back to the one before</Text>
    </Pressable>
  );
}

function PhaseCovered() {
  return <Text style={styles.nowNext}>Every piece of this phase is ticked off.</Text>;
}

/** What's open in front of you. The daily names this and nothing else — the same way
 * the reading daily names one book — so a sitting has one place to be. */
function NowStudying({ craft }: { craft: ApiCraft }) {
  const covered = craft.done >= craft.pieces;
  return (
    <View style={styles.nowStudying}>
      <Ionicons name="document-text" size={15} color={HUE} />
      <View style={styles.nowBody}>
        <Text style={styles.nowLabel}>NOW STUDYING</Text>
        <Text style={styles.nowTitle}>{craft.source}</Text>
        {covered ? <PhaseCovered /> : <UpNext next={craft.plan[craft.done + 1] ?? ''} />}
        {craft.done > 0 ? <UndoTick /> : null}
      </View>
    </View>
  );
}

/** One sitting already logged today, with a way to take it back. */
function StudiedRow({ entry, onRemove }: { entry: ApiLearning; onRemove: () => void }) {
  return (
    <View style={styles.sitting}>
      <Ionicons name="bookmark-outline" size={14} color={HUE} />
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

const STUDY_PROMPT = 'In your own words — what did you take away?';

/** The sitting you're drafting, shown the way it will read once logged. Tapping it
 * opens the shared note editor — the same one the journal and quest reflections
 * use, so formatting works the same everywhere. */
function StudyDraft({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? 'Edit what you studied' : 'Write what you studied'}
      style={({ pressed }) => [styles.draft, pressed && styles.draftPressed]}
    >
      <View style={styles.draftBody}>
        {value ? <Markdown value={value} /> : <Text style={styles.draftEmpty}>{STUDY_PROMPT}</Text>}
      </View>
      <Ionicons name="create-outline" size={15} color={HUE} />
    </Pressable>
  );
}

/**
 * What you took away from the source today — the Craft equivalent of logging which
 * chapters you read.
 *
 * This is what moves the bar above: each sitting is one of the phase's pieces. It
 * asks for the idea rather than a page number on purpose — a Notion page has no
 * chapter count, and what you can say back is the only honest measure of having read
 * it. Written in your own words, never copy-pasted, so it also feeds tomorrow
 * morning's recall.
 */
function StudyLog({ source }: { source: string }) {
  const addLearning = useSystem((s) => s.addLearning);
  const removeLearning = useSystem((s) => s.removeLearning);
  // `?? []` outside the selector: inside, a null state hands the store a fresh array
  // on every read and the render loops.
  const learnings = useSystem((s) => s.state?.learnings) ?? [];
  const save = useSaveState();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  const today = learnings.filter((l) => l.kind === 'notion');
  const canLog = note.trim().length > 0 && save.state !== 'saving';

  const submit = async () => {
    if (!canLog) return;
    const landed = await save.run(() =>
      addLearning({ kind: 'notion', source, text: note.trim() }),
    );
    if (landed) setNote('');
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>WHAT I STUDIED TODAY</Text>
      <Text style={styles.help}>
        Close the page and say the idea back. One sitting is one piece of the phase, at
        whatever pace suits you.
      </Text>
      <StudyDraft value={note} onPress={() => setEditing(true)} />
      <Pressable
        disabled={!canLog}
        onPress={submit}
        style={({ pressed }) => [
          styles.btn,
          styles.primary,
          styles.wide,
          !canLog && styles.primaryOff,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.primaryText}>{saveLabel(save.state, 'Log what I studied')}</Text>
      </Pressable>

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
            onRemove={() => void removeLearning(entry.id)}
          />
        ))
      ) : (
        <NothingStudiedYet />
      )}
    </View>
  );
}

/** Moving on to the next chapter or page. Folded away like the book picker: it
 * happens once every few sittings, while logging happens every sitting. */
function ChangeSource({ current }: { current: string }) {
  const setCraftSource = useSystem((s) => s.setCraftSource);
  const save = useSaveState();
  const [draft, setDraft] = useState('');
  const canSave = draft.trim().length > 0 && save.state !== 'saving';

  const submit = async () => {
    if (!canSave) return;
    const landed = await save.run(() => setCraftSource(draft.trim()));
    if (landed) setDraft('');
  };

  return (
    <View style={styles.form}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        style={styles.input}
        placeholder={current ? 'Move on to…' : 'e.g. DDIA ch 5 — Replication'}
        placeholderTextColor={text.faint}
        maxLength={160}
        onSubmitEditing={submit}
      />
      <Pressable
        disabled={!canSave}
        onPress={submit}
        style={({ pressed }) => [
          styles.btn,
          styles.primary,
          styles.wide,
          !canSave && styles.primaryOff,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.primaryText}>
          {saveLabel(save.state, current ? 'Change it' : 'Start studying it')}
        </Text>
      </Pressable>
    </View>
  );
}

/** Nothing picked yet — then naming the source *is* the card, with nothing folded. */
function PickSource() {
  return (
    <>
      <Text style={styles.help}>
        Pick the one thing you’re working through — a DDIA chapter, an Alex Xu chapter,
        a Notion page. The daily follows it until you move on.
      </Text>
      <ChangeSource current="" />
    </>
  );
}

/** Source, today's sitting, and moving on — the same three parts as the book, in the
 * same order, so both loops read the same way. */
function StudySection({ craft }: { craft: ApiCraft }) {
  const { open, toggle } = useCollapse(true, true);
  const source = craft.source;
  return (
    <>
      <NowStudying craft={craft} />
      <StudyLog source={source} />

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.disclose, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={text.faint} />
        <Text style={styles.discloseLabel}>Change what I’m studying</Text>
      </Pressable>
      {open ? <ChangeSource current={source} /> : null}
    </>
  );
}

/**
 * Where you are in the system-design plan — the Craft equivalent of the reading
 * panel. Progress is the Notion pages you've logged, not weeks elapsed: a plan that
 * advanced by date would march you past material you hadn't opened. The phase says
 * what this stretch covers; you pick which piece of it you're on.
 */
export function CraftPhaseCard() {
  const craft = useSystem((s) => s.state?.craft);
  if (!craft) return null;

  return (
    <SystemPanel title="System design" sub={`Phase ${craft.phase} of ${craft.phases}`}>
      <Text style={styles.phase}>{craft.label}</Text>
      <Text style={styles.detail}>{craft.detail}</Text>
      <PhaseProgress craft={craft} />
      {craft.source ? <StudySection craft={craft} /> : <PickSource />}
      {craft.pending ? <PhaseReview label={craft.label} /> : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  phase: { color: text.primary, fontSize: 15, fontWeight: '700' },
  detail: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 12 },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tallyLabel: { color: text.secondary, fontSize: 12 },
  tallyValue: { color: text.primary, fontSize: 12, fontWeight: '700' },
  meta: { color: text.faint, fontSize: 12, lineHeight: 17, marginTop: 8 },

  nowStudying: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 14,
    backgroundColor: withAlpha(HUE, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(HUE, 0.25),
    borderRadius: radius.md,
    padding: 11,
  },
  nowBody: { flex: 1, minWidth: 0, gap: 2 },
  nowLabel: { color: HUE, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  nowTitle: { color: text.primary, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  nowNext: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 8 },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  undoText: { color: text.secondary, fontSize: 12, fontWeight: '600' },

  section: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: surface.hairline },
  sectionLabel: {
    color: text.faint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  help: { color: text.secondary, fontSize: 12, lineHeight: 17, marginBottom: 10 },

  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: surface.base,
    marginBottom: 8,
  },
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
  draftPressed: { borderColor: HUE, backgroundColor: withAlpha(HUE, 0.05) },
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
  form: { marginTop: 12 },

  review: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: withAlpha(HUE, 0.4),
    backgroundColor: withAlpha(HUE, 0.06),
    borderRadius: radius.md,
    padding: 13,
    gap: 10,
  },
  reviewBody: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  wide: { paddingVertical: 11 },
  btnText: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  primary: { backgroundColor: HUE, borderColor: HUE },
  primaryOff: { backgroundColor: withAlpha(HUE, 0.35), borderColor: 'transparent' },
  primaryText: { color: onAccent, fontSize: 13, fontWeight: '700' },
});
