import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StackRow, spineFor } from '@/components/Recall/StackRow';
import { Card } from '@/components/ui/Card';
import { Text, TextInput } from '@/components/ui/Text';
import { ALL_PILE, pickShelf, type ShelfStack } from '@/lib/deck';
import { spellCount } from '@/lib/text';
import { TAP_MIN, font, neutral, radius, surface, text } from '@/theme';

function describeDue(dueLeft: number, materials: number): string {
  if (dueLeft === 0) return 'Nothing is scheduled today — open any material and test yourself anyway.';
  const word = spellCount(dueLeft);
  const opener = `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  const cards = dueLeft === 1 ? 'card is' : 'cards are';
  if (materials <= 1) return `${opener} ${cards} ready to be tested today. Anything else, search for it.`;
  return `${opener} ${cards} ready to be tested today, across ${spellCount(materials)} materials. Anything else, search for it.`;
}

/**
 * The way to the rest of the shelf. The picker lists what's due, which is a handful;
 * a reader with forty materials still has to be able to reach the one they want, and
 * scrolling forty rows to find it is not reaching it.
 */
function SearchField({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={15} color={neutral[700]} />
      <TextInput
        value={query}
        onChangeText={onQuery}
        placeholder="Search your books and materials"
        returnKeyType="search"
        accessibilityLabel="Search your books and materials"
        style={styles.searchInput}
      />
    </View>
  );
}

/** The line under the shelf: what it isn't showing, and the way to change that. */
function FoldRow({
  note,
  action,
  spoken,
  onPress,
}: {
  note: string;
  action: string;
  spoken: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.otherRow}>
      <Text style={styles.otherText}>{note}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        style={styles.foldTap}
      >
        <Text style={styles.showAll}>{action}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The way into the rest of the library, and back out of it again.
 *
 * The same line does both, because a shelf that opens with no way to close it leaves
 * the reader scrolling past forty materials to reach the mix at the foot — the fold
 * has to swing shut the way it swung open. A search needs neither: clearing the field
 * is already the way back, and a second control beside it would just compete.
 */
function ShelfFold({
  hidden,
  showAll,
  searching,
  onToggle,
}: {
  hidden: number;
  showAll: boolean;
  searching: boolean;
  onToggle: () => void;
}) {
  if (searching) return null;
  if (showAll) {
    return (
      <FoldRow
        note="Showing every material you have"
        action="Just what's due"
        spoken="Show only the materials due today"
        onPress={onToggle}
      />
    );
  }
  if (hidden === 0) return null;
  return (
    <FoldRow
      note={`${hidden} other ${hidden === 1 ? 'material' : 'materials'} — nothing to test today`}
      action="Search all"
      spoken="Show every material"
      onPress={onToggle}
    />
  );
}

/** A search that found nothing. Only ever reached by typing — a day with nothing
 * due falls back to the whole shelf rather than to an empty one. */
function NoMatch({ query }: { query: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>No material matches “{query.trim()}”.</Text>
    </View>
  );
}

function ShelfRows({ stacks, query, onPick }: { stacks: ShelfStack[]; query: string; onPick: (pile: string) => void }) {
  if (stacks.length === 0) return <NoMatch query={query} />;
  return (
    <>
      {stacks.map((s, n) => (
        <StackRow key={s.name} stack={s} hue={spineFor(n)} onPress={() => onPick(s.name)} />
      ))}
    </>
  );
}

/**
 * Step one of a recall sitting: pick the stack. A mixed pile gives you no context
 * to pull on — a kana straight after a system-design idea drills neither — so one
 * source at a time is the default, and the mix is a deliberate opt-in at the
 * bottom, harder on purpose.
 *
 * Only the materials with cards due are on the shelf. The rest are one search away,
 * because a picker that lists everything you have ever read buries the three books
 * that actually owe you work today.
 */
export function StackPicker({
  stacks,
  dueLeft,
  onPick,
}: {
  stacks: ShelfStack[];
  dueLeft: number;
  onPick: (pile: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const searching = query.trim().length > 0;
  const shown = pickShelf(stacks, query, showAll);

  return (
    <Card style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Try to recall</Text>
        <Text style={styles.blurb}>{describeDue(dueLeft, stacks.filter((s) => s.due > 0).length)}</Text>
      </View>

      <SearchField query={query} onQuery={setQuery} />

      <View style={styles.shelf}>
        <ShelfRows stacks={shown} query={query} onPick={onPick} />
        <ShelfFold
          hidden={stacks.length - shown.length}
          showAll={showAll}
          searching={searching}
          onToggle={() => setShowAll((open) => !open)}
        />
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orWord}>or</Text>
        <View style={styles.orLine} />
      </View>

      <Pressable
        onPress={() => onPick(ALL_PILE)}
        accessibilityRole="button"
        accessibilityLabel="Mix every stack together"
        style={({ pressed }) => [styles.mix, pressed && styles.mixPressed]}
      >
        <Text style={styles.mixLabel}>
          {dueLeft > 1 ? `Mix all ${spellCount(dueLeft)} · harder on purpose` : 'Mix everything · harder on purpose'}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  head: { gap: 5, paddingHorizontal: 4, paddingTop: 2 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 27, letterSpacing: -0.4, color: neutral[900] },
  blurb: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 19, color: text.secondary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: surface.hairline,
    backgroundColor: surface.muted,
  },
  searchInput: { flex: 1, minWidth: 0, fontFamily: font.regular, fontSize: 13, paddingVertical: 0 },
  shelf: { gap: 9 },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 6,
  },
  otherText: { flex: 1, minWidth: 0, fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, color: text.secondary },
  foldTap: { minHeight: TAP_MIN, justifyContent: 'center', paddingLeft: 8 },
  showAll: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    color: text.onClay,
    textDecorationLine: 'underline',
  },
  empty: { paddingHorizontal: 6, paddingVertical: 10 },
  emptyText: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 19, color: text.secondary },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: surface.hairline },
  orWord: { fontFamily: font.regular, fontSize: 11, color: text.secondary },
  mix: {
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: surface.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mixPressed: { backgroundColor: surface.muted },
  mixLabel: { fontFamily: font.semibold, fontSize: 12.5, color: neutral[800] },
});
