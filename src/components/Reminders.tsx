import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DayBand, bandRow } from '@/components/DayBand';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Box } from '@/components/ui/Check';
import { Text, TextInput } from '@/components/ui/Text';
import { useDayBands } from '@/hooks/useDayBands';
import type { ApiState } from '@/lib/api';
import { dateKey, dayOfStamp } from '@/lib/dates';
import { groupByDay, type DayGroup } from '@/lib/dayGroups';
import { useSystem } from '@/store/useSystem';
import { TAP_MIN, radius, surface, text } from '@/theme';

type Reminder = ApiState['reminders'][number];

/** A to-do's text can run long; the cap keeps the list a list. */
const MAX_LENGTH = 200;

/** One open to-do: tick it off, or × it away. */
function ReminderRow({ item, onToggle, onRemove }: { item: Reminder; onToggle: () => void; onRemove: () => void }) {
  return (
    <View style={bandRow.row}>
      <Pressable
        onPress={onToggle}
        style={bandRow.main}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false }}
        accessibilityLabel={`Tick off ${item.text}`}
      >
        <Box done={false} size={22} />
        <View style={bandRow.text}>
          <Text style={bandRow.label}>{item.text}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.text}`} style={bandRow.remove}>
        <Text style={bandRow.removeGlyph}>×</Text>
      </Pressable>
    </View>
  );
}

/**
 * Add a to-do to today, from inside today's band — the same shape as the money
 * ledger's add: one filled button at rest, the field only once you've asked for it.
 */
function AddToToday() {
  const addReminder = useSystem((s) => s.addReminder);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const ready = draft.trim().length > 0;

  const close = () => {
    setOpen(false);
    setDraft('');
  };

  const submit = () => {
    if (!ready) return; // nothing typed — nothing to add
    setDraft('');
    void addReminder(draft.trim());
  };

  if (!open) {
    return <Button label="Add to today" onPress={() => setOpen(true)} block style={styles.primary} />;
  }

  return (
    <View style={styles.addForm}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Refill the water bottle…"
        placeholderTextColor={text.faint}
        style={styles.input}
        maxLength={MAX_LENGTH}
        autoFocus
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={submit}
      />
      {/* Stays open after one lands — a sitting usually adds more than one. */}
      <Button label="Add to today" onPress={submit} disabled={!ready} block />
      <Button label="Done" onPress={close} tone="ghost" block />
    </View>
  );
}

/** A band's headline figure: how much is still open on that day. */
function describeBand(count: number): string {
  if (count === 0) return 'nothing yet';
  return count === 1 ? '1 left' : `${count} left`;
}

function ReminderBand({
  band,
  today,
  expanded,
  onToggle,
  children,
}: {
  band: DayGroup<Reminder>;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const toggleReminder = useSystem((s) => s.toggleReminder);
  const removeReminder = useSystem((s) => s.removeReminder);

  return (
    <DayBand
      day={band.day}
      today={today}
      trailing={describeBand(band.items.length)}
      expanded={expanded}
      onToggle={onToggle}
    >
      {band.items.map((item) => (
        <ReminderRow
          key={item.id}
          item={item}
          onToggle={() => void toggleReminder(item.id, true)}
          onRemove={() => void removeReminder(item.id)}
        />
      ))}
      {children}
    </DayBand>
  );
}

/**
 * The to-do list, banded by the day each line was jotted. Today is open with the
 * add button in it; earlier days fold to one line carrying what's still open there,
 * so a to-do left sitting since Thursday says so instead of blending into one flat
 * run where everything looks equally fresh.
 *
 * Only open items are here. Ticking one moves it to the You tab's Completed record,
 * where it can be undone — so a band that empties out disappears on its own.
 */
export function Reminders({ items }: { items: Reminder[] }) {
  const today = dateKey();
  const open = items.filter((r) => !r.done);
  // Oldest first inside a band — the order they were written is the order they were
  // meant to be done, unlike the money ledger, where the newest spend leads.
  const [todayBand, ...pastBands] = groupByDay(open, (r) => dayOfStamp(r.created_at), today);
  const bands = useDayBands(today);

  return (
    <SystemPanel title="To-do" sub={open.length ? `${open.length} left` : undefined}>
      <ReminderBand
        band={todayBand}
        today={today}
        expanded={bands.isOpen(todayBand.day)}
        onToggle={() => bands.toggle(todayBand.day)}
      >
        <AddToToday />
      </ReminderBand>
      {pastBands.map((band) => (
        <ReminderBand
          key={band.day}
          band={band}
          today={today}
          expanded={bands.isOpen(band.day)}
          onToggle={() => bands.toggle(band.day)}
        />
      ))}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  addForm: { paddingTop: 10, gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: text.primary,
    fontSize: 14,
    backgroundColor: surface.card,
    minHeight: TAP_MIN,
  },
  primary: { marginTop: 10 },
});
