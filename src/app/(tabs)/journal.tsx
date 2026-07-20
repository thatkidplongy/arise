import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { DataTable, type Column } from '@/components/DataTable';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiJournalEntry, ApiReflection } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import type { StatKey } from '@/types';
import { accent, onAccent, STAT_META, surface, text, withAlpha } from '@/theme';

type Tab = 'journal' | 'reflections';
type Filter = StatKey | 'all';

export default function JournalScreen() {
  const state = useSystem((s) => s.state);
  const addJournalEntry = useSystem((s) => s.addJournalEntry);

  const [tab, setTab] = useState<Tab>('journal');
  const [filter, setFilter] = useState<Filter>('all');
  const [composerOpen, setComposerOpen] = useState(false);

  const today = dateKey();
  const reflections = state?.reflections ?? [];
  const journal = state?.journal ?? [];

  // The categories actually present, in the app's canonical order, for the chips.
  // Depends on the stable state slice (not the `?? []` copy) so it only recomputes
  // when reflections actually change.
  const cats = useMemo(() => {
    const present = new Set((state?.reflections ?? []).map((r) => r.stat));
    return (Object.keys(STAT_META) as StatKey[]).filter((k) => present.has(k));
  }, [state?.reflections]);
  const shownReflections =
    filter === 'all' ? reflections : reflections.filter((r) => r.stat === filter);

  if (!state) {
    return (
      <Screen>
        <BackLink />
        <ConnectionPanel />
      </Screen>
    );
  }

  const open = (kind: 'journal' | 'reflection', id: string) =>
    router.push({ pathname: '/entry', params: { kind, id } });

  const journalCols: Column<ApiJournalEntry>[] = [
    {
      key: 'text',
      header: 'Entry',
      render: (e) => (
        <Text style={styles.title} numberOfLines={2}>
          {snippet(e.text) || '(empty)'}
        </Text>
      ),
    },
    {
      key: 'day',
      header: 'Date',
      width: 62,
      align: 'right',
      render: (e) => <Text style={styles.date}>{shortDay(e.day, today)}</Text>,
    },
  ];

  const reflectionCols: Column<ApiReflection>[] = [
    {
      key: 'cat',
      width: 30,
      render: (r) => {
        const meta = STAT_META[r.stat];
        return (
          <View style={[styles.iconBox, { backgroundColor: withAlpha(meta?.color ?? text.faint, 0.13) }]}>
            <Ionicons name={meta?.icon ?? 'bookmark'} size={14} color={meta?.color ?? text.faint} />
          </View>
        );
      },
    },
    {
      key: 'text',
      header: 'Reflection',
      render: (r) => (
        <>
          <Text style={styles.title} numberOfLines={2}>
            {snippet(r.prompt) || snippet(r.text) || '(empty)'}
          </Text>
          <Text style={styles.sub}>{STAT_META[r.stat]?.label ?? 'Note'}</Text>
        </>
      ),
    },
    {
      key: 'day',
      header: 'Date',
      width: 56,
      align: 'right',
      render: (r) => <Text style={styles.date}>{shortDay(r.day, today)}</Text>,
    },
  ];

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
            onPress={() => setComposerOpen(true)}
            style={({ pressed }) => [styles.writeBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="create-outline" size={16} color={onAccent} />
            <Text style={styles.writeText}>Write something for today</Text>
          </Pressable>

          {journal.length === 0 ? (
            <SystemPanel>
              <Text style={styles.empty}>Nothing written yet. Tap above to start today&apos;s entry.</Text>
            </SystemPanel>
          ) : (
            <DataTable
              columns={journalCols}
              rows={journal}
              keyExtractor={(e) => e.id}
              onRowPress={(e) => open('journal', e.id)}
              title="Entries"
              sub={`${journal.length}`}
              collapsible
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            What you wrote to complete your log quests — reading, money, craft, stillness. Tap one to read it in full.
          </Text>

          {cats.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {(['all', ...cats] as Filter[]).map((c) => {
                const on = filter === c;
                const meta = c === 'all' ? null : STAT_META[c];
                const color = meta?.color ?? accent;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setFilter(c)}
                    style={[styles.chip, on && { backgroundColor: withAlpha(color, 0.14), borderColor: color }]}
                  >
                    {meta ? <Ionicons name={meta.icon} size={12} color={on ? color : text.faint} /> : null}
                    <Text style={[styles.chipText, on && { color }]}>{meta?.label ?? 'All'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {shownReflections.length === 0 ? (
            <SystemPanel>
              <Text style={styles.empty}>
                {reflections.length === 0
                  ? 'Nothing yet. Complete a log quest by writing what you learned — it lands here.'
                  : 'No reflections in this category yet.'}
              </Text>
            </SystemPanel>
          ) : (
            <DataTable
              columns={reflectionCols}
              rows={shownReflections}
              keyExtractor={(r) => r.id}
              onRowPress={(r) => open('reflection', r.id)}
              title={filter === 'all' ? 'Reflections' : STAT_META[filter].label}
              sub={`${shownReflections.length}`}
              collapsible
            />
          )}
        </>
      )}

      <NoteEditorModal
        visible={composerOpen}
        prompt="What's on your mind today?"
        initial=""
        onSave={(t) => {
          setComposerOpen(false);
          void addJournalEntry(t);
        }}
        onClose={() => setComposerOpen(false)}
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
  chips: { gap: 7, paddingVertical: 1, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  iconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { color: text.primary, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  sub: { color: text.faint, fontSize: 11, marginTop: 1 },
  date: { color: text.secondary, fontSize: 12, fontWeight: '600' },
});
