import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { accent, surface, text, withAlpha } from '@/theme';

/**
 * The reading check-in. A book is never reset by a week ending — it carries on
 * with its progress intact. This shows only when the server flags a review as due
 * (the chapters you've logged cover the book): "Did you finish it?" → yes rolls to
 * the next book, not yet carries it over — no penalty either way.
 */
export function ReadingReview() {
  const review = useSystem((s) => s.state?.book_review);
  const reviewBook = useSystem((s) => s.reviewBook);
  const [finishing, setFinishing] = useState(false);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  if (!review?.pending) return null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📖 Reading check-in</Text>
      <Text style={styles.body}>Looks like you’ve read enough to finish “{review.book}”. Did you?</Text>

      {!finishing ? (
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.85 }]}
            onPress={() => setFinishing(true)}
            disabled={busy}
          >
            <Text style={styles.primaryText}>Yes, finished it</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
            onPress={() => run(() => reviewBook(false, ''))}
            disabled={busy}
          >
            <Text style={styles.btnText}>Not yet</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.nextWrap}>
          <Text style={styles.body}>Nice work. What’s next?</Text>
          <TextInput
            style={styles.input}
            placeholder="Next book title"
            placeholderTextColor={text.faint}
            value={next}
            onChangeText={setNext}
            autoFocus
          />
          <Pressable
            style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.85 }]}
            onPress={() => run(() => reviewBook(true, next))}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={surface.card} />
            ) : (
              <Text style={styles.primaryText}>{next.trim() ? 'Save & start' : 'Finish (pick next later)'}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.4),
    backgroundColor: withAlpha(accent, 0.06),
    borderRadius: 11,
    padding: 14,
    gap: 8,
  },
  title: {
    color: text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    color: text.secondary,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  nextWrap: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: text.primary,
    fontSize: 14,
    backgroundColor: surface.card,
  },
  btn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  primary: {
    backgroundColor: accent,
    borderColor: accent,
  },
  primaryText: {
    color: surface.card,
    fontSize: 13,
    fontWeight: '700',
  },
});
