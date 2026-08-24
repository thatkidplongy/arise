import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FlashCard } from '@/components/Recall/FlashCard';
import { KanaCard } from '@/components/Recall/KanaCard';
import { TipCard } from '@/components/Recall/TipCard';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { LEARNING_NOTE_MAX } from '@/consts';
import type { RecallGrade } from '@/lib/api';
import type { BringBack } from '@/lib/bringBack';
import { ALL_PILE, currentEntry, stackOf, type DeckState, type Stack } from '@/lib/deck';
import { dateKey } from '@/lib/dates';
import { qk } from '@/query/keys';
import { queryClient } from '@/query/client';
import { useKanaBook } from '@/store/useKanaBook';
import { useRecallDeck } from '@/store/useRecallDeck';
import { useSystem } from '@/store/useSystem';
import { font, neutral, sage, surface, text } from '@/theme';

/** Where the sitting stands, in the pile's own words. */
function describePlace(stack: Stack, currentIsDue: boolean): string {
  const dueDone = stack.due - stack.dueLeft;
  if (currentIsDue) return `card ${Math.min(dueDone + 1, stack.due)} of ${stack.due} due`;
  if (stack.left > 0) return `card ${stack.total - stack.left + 1} of ${stack.total}`;
  return `all ${stack.total} met`;
}

/** One segment per due card, filling as they're met — only while the pile owes any. */
function DueDashes({ stack, currentIsDue }: { stack: Stack; currentIsDue: boolean }) {
  if (stack.due === 0 || stack.due > 6) return null;
  const filled = Math.min(stack.due - stack.dueLeft + (currentIsDue ? 1 : 0), stack.due);
  return (
    <View style={styles.dashes}>
      {Array.from({ length: stack.due }, (_, i) => (
        <View key={i} style={[styles.dash, i < filled && styles.dashFilled]} />
      ))}
    </View>
  );
}

/** The pile's end — every card met, with a way to go through it again. A pile with
 * no cards at all is a stale link or a still-loading library, not an achievement. */
function PileDone({ total, onAgain }: { total: number; onAgain: () => void }) {
  if (total === 0) {
    return (
      <View style={styles.done}>
        <Text style={styles.doneText}>Nothing in this stack today — pick another from the shelf.</Text>
      </View>
    );
  }
  return (
    <View style={styles.done}>
      <Text style={styles.doneText}>
        That&apos;s the pile — all {total} met today. They&apos;ll come back when the schedule says so.
      </Text>
      <Button label="Go again" tone="secondary" onPress={onAgain} block />
    </View>
  );
}

/** What the sitting is showing: the pile's end, a tip, a character, or a card to try. */
function SessionBody({
  current,
  total,
  onAgain,
  onNext,
  onGrade,
  onEdit,
}: {
  current: BringBack | null;
  total: number;
  onAgain: () => void;
  onNext: () => void;
  onGrade: (grade: RecallGrade) => void;
  onEdit: () => void;
}) {
  if (!current) return <PileDone total={total} onAgain={onAgain} />;
  if (current.kind === 'tip') return <TipCard tip={current} onNext={onNext} />;
  if (current.kind === 'kana') return <KanaCard item={current.item} onGrade={onGrade} />;
  return <FlashCard item={current.item} onGrade={onGrade} onEdit={onEdit} />;
}

/**
 * A sitting with one stack: its name stays in the header the whole way through —
 * the source never leaves the card — with the day's place and the due cards'
 * progress beside it. Grading is what moves the pile along; a missed card slides
 * back in a few cards down, exactly like the physical stack.
 */
export function RecallSession({
  items,
  state,
  pile,
  dueIds,
}: {
  items: BringBack[];
  state: DeckState;
  pile: string;
  dueIds: string[];
}) {
  const deck = useRecallDeck();
  const gradeKana = useKanaBook((s) => s.grade);
  const gradeRecall = useSystem((s) => s.gradeRecall);
  const editRecall = useSystem((s) => s.editRecall);
  const [editing, setEditing] = useState(false);

  const stack = stackOf(items, state.met, dueIds, pile);
  const current = currentEntry(items, pile, state);
  const currentIsDue = current !== null && dueIds.includes(current.id);

  // Two ladders, one gesture: a highlight's rung lives on the server, a character's
  // in the kana book on this phone. Either way the card also leaves today's pile.
  const grade = (entry: BringBack) => (value: RecallGrade) => {
    if (entry.kind === 'kana') gradeKana(entry.item.char, value);
    else void gradeRecall(entry.id, value);
    if (value === 'missed') deck.miss(entry.id);
    else deck.meet(entry.id);
  };

  const saveEdit = async (id: string, value: string) => {
    setEditing(false);
    if (!value.trim()) return;
    await editRecall(id, value);
    // The back the session shows comes from the library cache, not just state.
    await queryClient.invalidateQueries({ queryKey: qk.recallLibrary(dateKey()) });
  };

  return (
    <Card style={styles.wrap}>
      <View style={styles.head}>
        {/* replace, not back(): inside the Tabs navigator back() lands on Status,
            not the shelf this sitting was opened from. */}
        <Pressable
          onPress={() => router.replace('/learn')}
          accessibilityRole="button"
          accessibilityLabel="Back to the stacks"
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Ionicons name="chevron-back" size={17} color={neutral[800]} />
        </Pressable>
        <View style={styles.headText}>
          <Text style={styles.headName} numberOfLines={1}>
            {pile === ALL_PILE ? 'Everything, mixed' : pile}
          </Text>
          <Text style={styles.headPlace}>{describePlace(stack, currentIsDue)}</Text>
        </View>
        <DueDashes stack={stack} currentIsDue={currentIsDue} />
      </View>

      {/* Keyed so each card arrives on its front, not the last one's turned state. */}
      <SessionBody
        key={current?.id ?? 'done'}
        current={current}
        total={stack.total}
        onAgain={() => deck.restart(items, pile)}
        onNext={() => (current ? deck.meet(current.id) : undefined)}
        onGrade={current ? grade(current) : () => undefined}
        onEdit={() => setEditing(true)}
      />

      {current?.kind === 'recall' ? (
        <NoteEditorModal
          visible={editing}
          prompt="The back of this card, in your own words."
          initial={current.item.text}
          maxLength={LEARNING_NOTE_MAX}
          onSave={(value) => void saveEdit(current.id, value)}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: surface.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: { backgroundColor: surface.hairline },
  headText: { flex: 1, minWidth: 0, gap: 1 },
  headName: { fontFamily: font.display, fontSize: 15, lineHeight: 18, color: neutral[900] },
  headPlace: { fontFamily: font.regular, fontSize: 11, color: text.secondary },
  dashes: { flexDirection: 'row', gap: 4 },
  dash: { width: 18, height: 5, borderRadius: 999, backgroundColor: surface.hairline },
  dashFilled: { backgroundColor: sage[600] },
  done: { gap: 14, paddingTop: 4 },
  doneText: { fontFamily: font.regular, fontSize: 14, lineHeight: 22, color: neutral[900] },
});
