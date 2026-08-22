import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/ui/Text';
import { useSystem } from '@/store/useSystem';
import { accent, clay, neutral, onAccent, radius, surface, text, typography } from '@/theme';

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
      <Text style={styles.title}>Reading check-in</Text>
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
    backgroundColor: clay[100],
    borderRadius: radius.lg,
    padding: 22,
    gap: 11,
  },
  title: {
    ...typography.section,
    color: neutral[900],
  },
  body: {
    ...typography.body,
    color: text.onClay,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  nextWrap: {
    gap: 8,
  },
  input: {
    ...typography.body,
    minHeight: 50,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: surface.card,
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: clay[500],
    borderRadius: radius.pill,
    minHeight: 48,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    ...typography.button,
    color: clay[700],
  },
  primary: {
    backgroundColor: accent,
    borderColor: accent,
  },
  primaryText: {
    ...typography.button,
    color: onAccent,
  },
});
