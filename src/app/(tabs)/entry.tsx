import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Button, ButtonRow } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { JOURNAL_NOTE_MAX } from '@/consts';
import { prettyDay } from '@/lib/dates';
import { useSystem } from '@/store/useSystem';
import type { StatKey } from '@/types';
import { STAT_META, STAT_TINT, TAP_MIN, clay, radius, text, typography, withAlpha } from '@/theme';

type Kind = 'journal' | 'reflection';

/**
 * The full view of one saved item — a free-form journal entry or a quest
 * reflection — reached by tapping a row on the Journal screen. It reads `kind`
 * and `id` from the route, looks the item up in the (already-loaded) state, and
 * lets you page Newer/Older through that same list without going back. Journal
 * entries can be edited here (reflections stay a read-only record; both delete).
 */
export default function EntryScreen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind: Kind = params.kind === 'reflection' ? 'reflection' : 'journal';
  const id = params.id ?? '';

  const state = useSystem((s) => s.state);
  const updateJournalEntry = useSystem((s) => s.updateJournalEntry);
  const removeJournalEntry = useSystem((s) => s.removeJournalEntry);
  const removeQuestNote = useSystem((s) => s.removeQuestNote);
  const [editing, setEditing] = useState(false);

  if (!state) {
    return (
      <Screen>
        <BackLink to="/journal" />
        <ConnectionPanel />
      </Screen>
    );
  }

  // The list is newest-first, so the previous index is the *newer* neighbour.
  const list = kind === 'reflection' ? state.reflections : state.journal;
  const index = list.findIndex((e) => e.id === id);
  const item = index >= 0 ? list[index] : null;
  // Reflection-only fields, resolved with their real type (no casts).
  const refl = kind === 'reflection' ? state.reflections.find((r) => r.id === id) : undefined;

  if (!item) {
    return (
      <Screen>
        <BackLink label="Journal" to="/journal" />
        <SystemPanel>
          <Text style={styles.gone}>This entry is no longer here — it may have been deleted.</Text>
        </SystemPanel>
      </Screen>
    );
  }

  const newer = list[index - 1] ?? null;
  const older = list[index + 1] ?? null;
  const go = (target: { id: string } | null) => {
    if (target) router.setParams({ kind, id: target.id });
  };
  const remove = () => {
    if (kind === 'reflection') void removeQuestNote(item.id);
    else void removeJournalEntry(item.id);
    router.replace('/journal');
  };

  const meta = refl ? STAT_META[refl.stat as StatKey] ?? null : null;
  const questTitle = refl ? state.quests.find((q) => q.id === refl.quest_id)?.title ?? null : null;

  return (
    <Screen>
      <BackLink label="Journal" to="/journal" />

      <View style={styles.head}>
        {meta ? (
          <View style={[styles.chip, { backgroundColor: withAlpha(meta.color, STAT_TINT) }]}>
            <Ionicons name={meta.icon} size={13} color={meta.color} />
            <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        ) : (
          <View style={[styles.chip, { backgroundColor: clay[200] }]}>
            <Ionicons name="book-outline" size={13} color={clay[800]} />
            <Text style={[styles.chipText, { color: clay[800] }]}>Journal</Text>
          </View>
        )}
        <Text style={styles.date}>{prettyDay(item.day)}</Text>
      </View>

      {refl?.prompt ? <Text style={styles.prompt}>{refl.prompt}</Text> : null}
      {questTitle ? <Text style={styles.source}>From: {questTitle}</Text> : null}

      <SystemPanel>
        <Markdown value={item.text} />
      </SystemPanel>

      <ButtonRow>
        {kind === 'journal' ? (
          <Button label="Edit" icon="create-outline" onPress={() => setEditing(true)} style={styles.grow} />
        ) : null}
        <Button label="Delete" icon="trash-outline" tone="danger" onPress={remove} style={styles.grow} />
      </ButtonRow>

      <ButtonRow>
        <Button
          label="Newer"
          icon="chevron-up"
          tone="quiet"
          disabled={!newer}
          onPress={() => go(newer)}
          style={styles.grow}
        />
        <Button
          label="Older"
          icon="chevron-down"
          tone="quiet"
          disabled={!older}
          onPress={() => go(older)}
          style={styles.grow}
        />
      </ButtonRow>

      <NoteEditorModal
        visible={editing}
        prompt="Edit your entry"
        initial={item.text}
        maxLength={JOURNAL_NOTE_MAX}
        onSave={(t) => {
          setEditing(false);
          void updateJournalEntry(item.id, t);
        }}
        onClose={() => setEditing(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gone: { ...typography.body, color: text.secondary },
  grow: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP_MIN },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipText: { ...typography.label, fontSize: 11.5 },
  date: { ...typography.label, color: text.secondary },
  prompt: { ...typography.body, fontSize: 14, lineHeight: 22, color: text.secondary, fontStyle: 'italic' },
  source: { ...typography.small, color: text.faint },
});
