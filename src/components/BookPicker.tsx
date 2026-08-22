import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SearchRow } from '@/components/SearchRow';
import { Text } from '@/components/ui/Text';
import { useSearch } from '@/hooks/useSearch';
import type { ApiBook, ApiBookShelf } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { accent, neutral, surface, text, typography } from '@/theme';

/** Estimate chapters from page count (~15 pages/chapter) — a starting guess the
 * user can adjust; 0 when the page count is unknown. */
function estChapters(pages: number): number {
  return pages > 0 ? Math.max(1, Math.round(pages / 15)) : 0;
}

function Cover({ url, size }: { url: string; size: number }) {
  const box = { width: size, height: Math.round(size * 1.5), borderRadius: 4, backgroundColor: surface.raised };
  if (url) return <Image source={{ uri: url }} style={box} resizeMode="cover" />;
  return (
    <View style={[box, styles.coverPlaceholder]}>
      <Ionicons name="book-outline" size={Math.round(size * 0.55)} color={text.faint} />
    </View>
  );
}

/** Search Open Library (or browse themed shelves) and pick a book. `onPick` gets
 * the title and a chapter estimate; the parent fills its book form from those. */
export function BookPicker({ onPick }: { onPick: (title: string, chapters: number) => void }) {
  const searchBooks = useSystem((s) => s.searchBooks);
  const suggestBooks = useSystem((s) => s.suggestBooks);

  const { query, setQuery, results, searching, note, run, reset } = useSearch<ApiBook>(searchBooks, {
    empty: 'No matches — try another title, or just type it below.',
    error: 'Book search is unavailable right now — type the title below.',
  });
  const [shelves, setShelves] = useState<ApiBookShelf[]>([]);

  useEffect(() => {
    let alive = true;
    void suggestBooks().then((s) => {
      if (alive) setShelves(s);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (b: ApiBook) => {
    onPick(b.title, estChapters(b.pages));
    reset();
  };

  return (
    <View style={styles.wrap}>
      <SearchRow
        value={query}
        onChangeText={setQuery}
        onSubmit={run}
        searching={searching}
        placeholder="Search a book (title or author)"
      />
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((b, i) => (
            <Pressable
              key={`${b.title}-${i}`}
              onPress={() => pick(b)}
              style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
            >
              <Cover url={b.cover_url} size={30} />
              <View style={styles.resultMain}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {b.title}
                </Text>
                <Text style={styles.resultMeta} numberOfLines={1}>
                  {[b.author, b.year ? String(b.year) : '', b.pages ? `${b.pages} pp` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={accent} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {shelves.length > 0 ? (
        <View style={styles.shelves}>
          <Text style={styles.shelvesLabel}>Or browse suggestions</Text>
          {shelves.map((sh) => (
            <View key={sh.label} style={styles.shelf}>
              <Text style={styles.shelfTitle}>{sh.label}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.shelfRow}
              >
                {sh.books.map((b, i) => (
                  <Pressable
                    key={`${b.title}-${i}`}
                    onPress={() => pick(b)}
                    style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
                  >
                    <Cover url={b.cover_url} size={56} />
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {b.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  note: { ...typography.small, color: text.secondary, marginTop: 8 },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  results: { marginTop: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  resultMain: { flex: 1 },
  resultTitle: { ...typography.cardTitle, fontSize: 13, color: neutral[900] },
  resultMeta: { ...typography.tiny, color: text.faint, marginTop: 2 },
  shelves: { marginTop: 14 },
  shelvesLabel: { ...typography.kicker, color: text.secondary, marginBottom: 10 },
  shelf: { marginBottom: 12 },
  shelfTitle: { ...typography.heading, fontSize: 16, color: neutral[900], marginBottom: 8 },
  shelfRow: { gap: 10, paddingRight: 8 },
  card: { width: 56 },
  cardTitle: { ...typography.tiny, fontSize: 10, lineHeight: 13, color: text.secondary, marginTop: 5 },
});
