import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import type { ApiReadingLog } from '@/lib/api';
import { countChapters, describeChaptersRead } from '@/lib/reading';
import { useSystem } from '@/store/useSystem';
import { accent, onAccent, surface, text, withAlpha } from '@/theme';

/** One sitting already logged today, with a way to take it back. */
function LoggedSitting({ entry, onRemove }: { entry: ApiReadingLog; onRemove: () => void }) {
  const count = `${entry.chapters} chapter${entry.chapters === 1 ? '' : 's'}`;
  return (
    <View style={styles.row}>
      <Ionicons name="bookmark-outline" size={15} color={accent} />
      <Text style={styles.rowLabel} numberOfLines={1}>
        {entry.label || count}
      </Text>
      {entry.label ? <Text style={styles.rowCount}>{count}</Text> : null}
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${entry.label || count}`}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

function NothingLoggedYet() {
  return <Text style={styles.empty}>Nothing logged today. Whatever you got through counts.</Text>;
}

/**
 * Where you say what you actually read today — which chapters, and how many.
 *
 * The app deliberately sets no chapters-per-day target: a quota it picked turns a
 * good sitting into a failed one, and only you know what today had room for. These
 * are the numbers the book's progress is made of, so log as many sittings as you
 * like — they add up.
 */
export function ReadingLogCard() {
  const reading = useSystem((s) => s.state?.reading);
  const logReading = useSystem((s) => s.logReading);
  const removeReadingLog = useSystem((s) => s.removeReadingLog);
  const save = useSaveState();

  const [label, setLabel] = useState('');
  const [count, setCount] = useState('');
  // Once you've set a count by hand, typing more chapters shouldn't overwrite it.
  const [countEdited, setCountEdited] = useState(false);

  if (!reading) return null;

  // A phone can be updated before the backend service is, so treat the reading-log
  // fields as absent-until-restarted rather than crashing the Status screen.
  const loggedToday = reading.logged_today ?? [];
  const chaptersRead = reading.chapters_read ?? 0;

  const derived = countChapters(label);
  const chapters = countEdited ? parseInt(count, 10) || 0 : derived;
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
    <SystemPanel
      title="Today's reading"
      sub={describeChaptersRead(chaptersRead, reading.chapters)}
    >
      <Text style={styles.help}>
        What did you read today? Put the chapters in however you say them — “5–7”, “12”, “the
        intro” — and the count follows along. No daily quota: your pace is the pace.
      </Text>

      <View style={styles.inputs}>
        <TextInput
          value={label}
          onChangeText={onLabelChange}
          style={[styles.input, styles.labelInput]}
          placeholder="Which chapters · e.g. 5–7"
          placeholderTextColor={text.faint}
          maxLength={120}
          onSubmitEditing={submit}
        />
        <TextInput
          value={count}
          onChangeText={onCountChange}
          style={[styles.input, styles.countInput]}
          keyboardType="number-pad"
          placeholder="How many"
          placeholderTextColor={text.faint}
          maxLength={3}
          onSubmitEditing={submit}
        />
      </View>

      <Pressable
        disabled={!canLog}
        onPress={submit}
        style={({ pressed }) => [styles.btn, !canLog && styles.btnOff, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.btnText}>{saveLabel(save.state, 'Log what I read')}</Text>
      </Pressable>

      <View style={styles.logged}>
        {loggedToday.length ? (
          loggedToday.map((entry) => (
            <LoggedSitting
              key={entry.id}
              entry={entry}
              onRemove={() => void removeReadingLog(entry.id)}
            />
          ))
        ) : (
          <NothingLoggedYet />
        )}
      </View>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  inputs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: surface.base,
  },
  labelInput: { flex: 1 },
  countInput: { width: 104, textAlign: 'center' },
  btn: { backgroundColor: accent, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnOff: { backgroundColor: withAlpha(accent, 0.35) },
  btnText: { color: onAccent, fontSize: 14, fontWeight: '700' },
  logged: { marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  rowLabel: { flex: 1, color: text.primary, fontSize: 14, fontWeight: '600' },
  rowCount: { color: text.faint, fontSize: 12 },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700' },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
});
