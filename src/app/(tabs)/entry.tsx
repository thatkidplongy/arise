import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { prettyDay } from '@/lib/dates';
import { useSystem } from '@/store/useSystem';
import type { StatKey } from '@/types';
import { accent, feedback, onAccent, STAT_META, surface, text, withAlpha } from '@/theme';

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
        <BackLink />
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
        <BackLink label="Journal" />
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
    if (router.canGoBack()) router.back();
    else router.replace('/journal');
  };

  const meta = refl ? STAT_META[refl.stat as StatKey] ?? null : null;
  const questTitle = refl ? state.quests.find((q) => q.id === refl.quest_id)?.title ?? null : null;

  return (
    <Screen>
      <BackLink label="Journal" />

      <View style={styles.head}>
        {meta ? (
          <View style={[styles.chip, { backgroundColor: withAlpha(meta.color, 0.14) }]}>
            <Ionicons name={meta.icon} size={13} color={meta.color} />
            <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        ) : (
          <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.12) }]}>
            <Ionicons name="book-outline" size={13} color={accent} />
            <Text style={[styles.chipText, { color: accent }]}>Journal</Text>
          </View>
        )}
        <Text style={styles.date}>{prettyDay(item.day)}</Text>
      </View>

      {refl?.prompt ? <Text style={styles.prompt}>{refl.prompt}</Text> : null}
      {questTitle ? <Text style={styles.source}>From: {questTitle}</Text> : null}

      <SystemPanel>
        <Markdown value={item.text} />
      </SystemPanel>

      <View style={styles.actions}>
        {kind === 'journal' ? (
          <Pressable
            onPress={() => setEditing(true)}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="create-outline" size={15} color={onAccent} />
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={remove}
          style={({ pressed }) => [styles.action, styles.danger, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="trash-outline" size={15} color={feedback.danger} />
          <Text style={[styles.actionText, { color: feedback.danger }]}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.pager}>
        <Pressable
          disabled={!newer}
          onPress={() => go(newer)}
          style={({ pressed }) => [styles.pageBtn, !newer && styles.pageOff, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-up" size={15} color={newer ? accent : text.faint} />
          <Text style={[styles.pageText, !newer && styles.pageTextOff]}>Newer</Text>
        </Pressable>
        <Pressable
          disabled={!older}
          onPress={() => go(older)}
          style={({ pressed }) => [styles.pageBtn, !older && styles.pageOff, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.pageText, !older && styles.pageTextOff]}>Older</Text>
          <Ionicons name="chevron-down" size={15} color={older ? accent : text.faint} />
        </Pressable>
      </View>

      <NoteEditorModal
        visible={editing}
        prompt="Edit your entry"
        initial={item.text}
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
  gone: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  date: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  prompt: { color: text.secondary, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  source: { color: text.faint, fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  actionText: { color: onAccent, fontSize: 14, fontWeight: '700' },
  danger: { backgroundColor: withAlpha(feedback.danger, 0.1), paddingHorizontal: 14 },
  pager: { flexDirection: 'row', gap: 8 },
  pageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 10,
    paddingVertical: 11,
  },
  pageOff: { opacity: 0.5 },
  pageText: { color: accent, fontSize: 13, fontWeight: '700' },
  pageTextOff: { color: text.faint },
});
