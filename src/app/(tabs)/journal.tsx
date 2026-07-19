import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Markdown } from '@/components/Markdown';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { groupByDay, prettyDay } from '@/lib/dates';
import { useSystem } from '@/store/useSystem';
import { accent, onAccent, STAT_META, surface, text, withAlpha } from '@/theme';

type Tab = 'journal' | 'reflections';

export default function JournalScreen() {
  const state = useSystem((s) => s.state);
  const addJournalEntry = useSystem((s) => s.addJournalEntry);
  const updateJournalEntry = useSystem((s) => s.updateJournalEntry);
  const removeJournalEntry = useSystem((s) => s.removeJournalEntry);
  const removeQuestNote = useSystem((s) => s.removeQuestNote);

  const [tab, setTab] = useState<Tab>('journal');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initial, setInitial] = useState('');

  if (!state) {
    return (
      <Screen>
        <BackLink />
        <ConnectionPanel />
      </Screen>
    );
  }

  const journal = state.journal;
  const reflections = state.reflections;

  const openNew = () => {
    setEditingId(null);
    setInitial('');
    setEditorOpen(true);
  };
  const openEdit = (e: { id: string; text: string }) => {
    setEditingId(e.id);
    setInitial(e.text);
    setEditorOpen(true);
  };
  const save = (t: string) => {
    setEditorOpen(false);
    if (editingId) void updateJournalEntry(editingId, t);
    else void addJournalEntry(t);
  };

  return (
    <Screen>
      <BackLink />
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Journal</Text>
        <Text style={styles.count}>{tab === 'journal' ? journal.length : reflections.length}</Text>
      </View>

      <View style={styles.tabs}>
        {(['journal', 'reflections'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === 'journal' ? 'Journal' : 'Reflections'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'journal' ? (
        <>
          <Text style={styles.intro}>A free space — write anything you want for the day.</Text>
          <Pressable
            onPress={openNew}
            style={({ pressed }) => [styles.writeBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="create-outline" size={16} color={onAccent} />
            <Text style={styles.writeText}>Write something for today</Text>
          </Pressable>

          {journal.length === 0 ? (
            <SystemPanel>
              <Text style={styles.empty}>Nothing written yet. Tap above to start today's entry.</Text>
            </SystemPanel>
          ) : (
            groupByDay(journal).map((group) => (
              <SystemPanel key={group.day} title={prettyDay(group.day)}>
                {group.items.map((e) => (
                  <View key={e.id} style={styles.entry}>
                    <Pressable style={styles.entryBody} onPress={() => openEdit(e)}>
                      <Markdown value={e.text} />
                    </Pressable>
                    <Pressable onPress={() => void removeJournalEntry(e.id)} hitSlop={8}>
                      <Text style={styles.entryX}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </SystemPanel>
            ))
          )}
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            What you wrote to complete your log quests — reading, money, craft, stillness — by day.
          </Text>
          {reflections.length === 0 ? (
            <SystemPanel>
              <Text style={styles.empty}>
                Nothing yet. Complete a log quest by writing what you learned — it lands here.
              </Text>
            </SystemPanel>
          ) : (
            groupByDay(reflections).map((group) => (
              <SystemPanel key={group.day} title={prettyDay(group.day)}>
                {group.items.map((e) => {
                  const meta = STAT_META[e.stat] ?? null;
                  return (
                    <View key={e.id} style={styles.entry}>
                      <View
                        style={[styles.tag, { backgroundColor: withAlpha(meta?.color ?? text.faint, 0.14) }]}
                      >
                        <Ionicons name={meta?.icon ?? 'bookmark'} size={13} color={meta?.color ?? text.faint} />
                      </View>
                      <View style={styles.reflectionBody}>
                        <Text style={[styles.entryStat, { color: meta?.color ?? text.secondary }]}>
                          {meta?.label ?? 'Note'}
                        </Text>
                        {e.prompt ? <Text style={styles.entryPrompt}>{e.prompt}</Text> : null}
                        <Markdown value={e.text} />
                      </View>
                      <Pressable onPress={() => void removeQuestNote(e.id)} hitSlop={8}>
                        <Text style={styles.entryX}>×</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </SystemPanel>
            ))
          )}
        </>
      )}

      <NoteEditorModal
        visible={editorOpen}
        prompt={editingId ? 'Edit your entry' : "What's on your mind today?"}
        initial={initial}
        onSave={save}
        onClose={() => setEditorOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  count: { color: text.secondary, fontSize: 14, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
  },
  tabOn: { borderColor: accent, backgroundColor: withAlpha(accent, 0.1) },
  tabText: { color: text.faint, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: accent },
  intro: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  writeText: { color: onAccent, fontSize: 14, fontWeight: '700' },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  entry: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  entryBody: { flex: 1 },
  reflectionBody: { flex: 1, gap: 3 },
  tag: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  entryStat: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  entryPrompt: { color: text.secondary, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  entryX: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
});
