import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BookPicker } from '@/components/BookPicker';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, onAccent, surface, text, withAlpha } from '@/theme';

type SaveState = 'idle' | 'saving' | 'done';

/** Set / change the book you're reading — search Open Library or browse shelves,
 * then save. Lives with the reading loop on the Quests screen. */
export function CurrentBookCard() {
  const state = useSystem((s) => s.state);
  const saveBook = useSystem((s) => s.saveBook);

  // Inputs stay empty — they're for entering a *new* book. What you're currently
  // reading is shown in the banner below, not pre-filled here.
  const [bookDraft, setBookDraft] = useState('');
  const [chaptersDraft, setChaptersDraft] = useState('');
  const [bookSave, setBookSave] = useState<SaveState>('idle');

  if (!state) return null;

  const current = state.player.current_book;
  const currentChapters = state.player.current_book_chapters;

  const canSave = bookDraft.trim().length > 0 && bookSave !== 'saving';

  const saveBookFlow = async () => {
    const title = bookDraft.trim();
    if (!title) return; // never clear the current book with an empty save
    setBookSave('saving');
    const chapters = Math.max(0, parseInt(chaptersDraft, 10) || 0);
    await saveBook(title, chapters);
    if (useSystem.getState().status === 'online') {
      setBookDraft(''); // don't persist the entry — the banner now reflects it
      setChaptersDraft('');
      setBookSave('done');
      setTimeout(() => setBookSave('idle'), 1600);
    } else {
      setBookSave('idle');
    }
  };

  return (
    <SystemPanel title="Current book" sub={`${state.player.books_finished} finished`}>
      {current ? (
        <View style={styles.nowReading}>
          <Ionicons name="book" size={16} color={accent} />
          <View style={styles.nowBody}>
            <Text style={styles.nowLabel}>NOW READING</Text>
            <Text style={styles.nowTitle}>{current}</Text>
            {currentChapters ? <Text style={styles.nowMeta}>{currentChapters} chapters</Text> : null}
          </View>
        </View>
      ) : null}
      <Text style={styles.help}>
        Your Grow daily is to read at your own pace — which quietly speeds up as your Intelligence
        level climbs. {current ? 'To change it, search' : 'Search'} a title (or browse a shelf), or
        type your own; the chapter count paces you and can be left blank. Each week it asks if you
        finished.
      </Text>
      <BookPicker
        onPick={(title, chapters) => {
          setBookDraft(title);
          if (chapters > 0) setChaptersDraft(String(chapters));
        }}
      />
      <TextInput
        value={bookDraft}
        onChangeText={setBookDraft}
        style={styles.input}
        placeholder="e.g. Atomic Habits — James Clear"
        placeholderTextColor={text.faint}
        maxLength={120}
      />
      <TextInput
        value={chaptersDraft}
        onChangeText={(v) => setChaptersDraft(v.replace(/[^0-9]/g, ''))}
        style={styles.input}
        keyboardType="number-pad"
        placeholder="Total chapters (optional) · e.g. 20"
        placeholderTextColor={text.faint}
        maxLength={4}
      />
      <Pressable
        disabled={!canSave}
        style={({ pressed }) => [styles.btn, (pressed || !canSave) && { opacity: 0.5 }]}
        onPress={saveBookFlow}
      >
        <Text style={styles.btnText}>
          {bookSave === 'saving' ? 'Saving…' : bookSave === 'done' ? 'Saved ✓' : current ? 'Change book' : 'Save book'}
        </Text>
      </Pressable>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  nowReading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: withAlpha(accent, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.25),
    borderRadius: 10,
    padding: 11,
    marginBottom: 12,
  },
  nowBody: { flex: 1, gap: 2 },
  nowLabel: { color: accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  nowTitle: { color: text.primary, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  nowMeta: { color: text.faint, fontSize: 11 },
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: surface.base,
  },
  btn: { backgroundColor: accent, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: onAccent, fontSize: 14, fontWeight: '700' },
});
