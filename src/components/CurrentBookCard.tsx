import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { BookPicker } from '@/components/BookPicker';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, surface, text } from '@/theme';

type SaveState = 'idle' | 'saving' | 'done';

/** Set / change the book you're reading — search Open Library or browse shelves,
 * then save. Lives with the reading loop on the Quests screen. */
export function CurrentBookCard() {
  const state = useSystem((s) => s.state);
  const saveBook = useSystem((s) => s.saveBook);

  const [bookDraft, setBookDraft] = useState(state?.player.current_book ?? '');
  const [chaptersDraft, setChaptersDraft] = useState(
    state?.player.current_book_chapters ? String(state.player.current_book_chapters) : '',
  );
  const [bookSave, setBookSave] = useState<SaveState>('idle');

  useEffect(() => setBookDraft(state?.player.current_book ?? ''), [state?.player.current_book]);
  useEffect(
    () =>
      setChaptersDraft(
        state?.player.current_book_chapters ? String(state.player.current_book_chapters) : '',
      ),
    [state?.player.current_book_chapters],
  );

  if (!state) return null;

  const saveBookFlow = async () => {
    setBookSave('saving');
    const chapters = Math.max(0, parseInt(chaptersDraft, 10) || 0);
    await saveBook(bookDraft.trim(), chapters);
    if (useSystem.getState().status === 'online') {
      setBookSave('done');
      setTimeout(() => setBookSave('idle'), 1600);
    } else {
      setBookSave('idle');
    }
  };

  return (
    <SystemPanel title="Current book" sub={`${state.player.books_finished} finished`}>
      <Text style={styles.help}>
        What you’re reading now. Your Grow daily is to read it at your own pace — which quietly
        speeds up as your Intelligence level climbs. Search a title (or browse a shelf) to fill it
        in, or type your own; the chapter count paces you and can be left blank. Each week it asks
        if you finished.
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
        disabled={bookSave === 'saving'}
        style={({ pressed }) => [styles.btn, (pressed || bookSave === 'saving') && { opacity: 0.8 }]}
        onPress={saveBookFlow}
      >
        <Text style={styles.btnText}>
          {bookSave === 'saving' ? 'Saving…' : bookSave === 'done' ? 'Saved ✓' : 'Save book'}
        </Text>
      </Pressable>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
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
  btnText: { color: '#FBF5EB', fontSize: 14, fontWeight: '700' },
});
