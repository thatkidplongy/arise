import { StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { Text } from '@/components/ui/Text';
import type { ApiPace, ApiReading, ApiShelfBook } from '@/lib/api';
import { dayMonth } from '@/lib/dates';
import { describeFinish, describePace, describeSpan } from '@/lib/reading';
import { useSystem } from '@/store/useSystem';
import { clay, neutral, radius, space, text, typography } from '@/theme';

/** How the book being read now is going, and when it lands at that pace. */
function Pace({ book, pace }: { book: string; pace: ApiPace }) {
  return (
    <View style={styles.pace}>
      <Text style={styles.kicker}>Reading now</Text>
      <Text style={styles.paceBook} numberOfLines={2}>
        {book}
      </Text>
      <Text style={styles.paceLine}>
        Started {dayMonth(pace.started)} · {describeSpan(pace.days_in)} in · {describePace(pace.per_week)}
      </Text>
      <Text style={styles.paceFinish}>{describeFinish(pace)}</Text>
    </View>
  );
}

/** One book on the shelf: when it ran, and what it took. */
function ShelfRow({ entry, current }: { entry: ApiShelfBook; current: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowBook} numberOfLines={1}>
          {entry.book}
        </Text>
        <Text style={styles.rowDates}>
          {dayMonth(entry.started)} → {current ? 'now' : dayMonth(entry.last)}
        </Text>
      </View>
      <Text style={[styles.rowSpan, current && styles.rowSpanCurrent]}>{describeSpan(entry.days)}</Text>
    </View>
  );
}

/** The average, which is the only answer to "how long does a book take me" that
 * isn't one book's story. Only once there's more than one to average. */
function Average({ shelf }: { shelf: ApiShelfBook[] }) {
  if (shelf.length < 2) return null;
  const mean = Math.round(shelf.reduce((sum, b) => sum + b.days, 0) / shelf.length);
  return (
    <Text style={styles.average}>
      {shelf.length} books so far, {describeSpan(mean)} each on average
    </Text>
  );
}

/**
 * The reading record: the book being read now with the pace it's actually going at,
 * and every book behind it with how long each one took.
 *
 * One place on purpose. "How long until I finish" used to be answerable only by
 * reading the log and doing the arithmetic, and "how long does a book take me" not
 * at all — the card showed a bar and a chapter count and nothing about time. Every
 * number here is derived in `reading.py` and read, never recomputed.
 */
export function ReadingRecord() {
  const reading: ApiReading | null | undefined = useSystem((s) => s.state?.reading);
  if (!reading) return null;

  const shelf = reading.shelf ?? []; // absent until the backend service restarts
  if (!reading.pace && shelf.length === 0) return null;

  return (
    <SystemPanel title="The reading record" sub="Your own pace, said back to you" collapsible>
      {reading.pace ? <Pace book={reading.book} pace={reading.pace} /> : null}
      {shelf.length > 0 ? (
        <View style={styles.shelf}>
          <Text style={styles.kicker}>Every book</Text>
          {[...shelf].reverse().map((entry) => (
            <ShelfRow key={entry.book + entry.started} entry={entry} current={entry.book === reading.book} />
          ))}
          <Average shelf={shelf} />
        </View>
      ) : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  kicker: { ...typography.kicker, color: text.faint },
  pace: { gap: space.xs, paddingBottom: space.md },
  paceBook: { ...typography.heading, color: text.primary },
  paceLine: { ...typography.small, color: text.secondary },
  paceFinish: { ...typography.body, color: text.onClay },
  shelf: { gap: space.xs, borderTopWidth: 1, borderTopColor: neutral[200], paddingTop: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: neutral[100],
    borderRadius: radius.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowBook: { ...typography.cardTitle, color: text.primary },
  rowDates: { ...typography.tiny, color: text.faint },
  rowSpan: { ...typography.label, color: text.secondary },
  rowSpanCurrent: { color: clay[700] },
  average: { ...typography.small, color: text.faint, paddingTop: space.xs },
});
