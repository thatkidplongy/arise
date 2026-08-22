import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { DataTable, type Column } from '@/components/DataTable';
import { NoteEditorModal } from '@/components/NoteEditorModal';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { ChoiceChip } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { JOURNAL_NOTE_MAX } from '@/consts';
import type { ApiJournalEntry, ApiReflection } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { snippet } from '@/lib/text';
import { useSystem } from '@/store/useSystem';
import type { StatKey } from '@/types';
import { STAT_META, STAT_TINT, clay, neutral, radius, text, typography, withAlpha } from '@/theme';

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
      width: 70,
      align: 'right',
      render: (e) => <Text style={styles.date}>{shortDay(e.day, today)}</Text>,
    },
  ];

  const reflectionCols: Column<ApiReflection>[] = [
    {
      key: 'cat',
      width: 32,
      render: (r) => {
        const meta = STAT_META[r.stat];
        return (
          <View style={[styles.iconBox, { backgroundColor: withAlpha(meta?.color ?? text.faint, STAT_TINT) }]}>
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
      width: 70,
      align: 'right',
      render: (r) => <Text style={styles.date}>{shortDay(r.day, today)}</Text>,
    },
  ];

  return (
    <Screen>
      <BackLink />
      <ScreenTitle>Journal</ScreenTitle>
      <ScreenBlurb>Quest reflections land here on their own. The rest is yours.</ScreenBlurb>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'journal', label: `Journal · ${journal.length}` },
          { value: 'reflections', label: `Reflections · ${reflections.length}` },
        ]}
      />

      {tab === 'journal' ? (
        <>
          <Text style={styles.intro}>A free space — write anything you want for the day.</Text>
          <Button
            label="Write something for today"
            icon="create-outline"
            onPress={() => setComposerOpen(true)}
            block
            large
          />

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
                const meta = c === 'all' ? null : STAT_META[c];
                return (
                  <ChoiceChip
                    key={c}
                    label={meta?.label ?? 'All'}
                    color={meta?.color ?? clay[600]}
                    selected={filter === c}
                    onPress={() => setFilter(c)}
                  />
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
        maxLength={JOURNAL_NOTE_MAX}
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
  intro: { ...typography.body, color: text.secondary },
  empty: { ...typography.body, color: text.secondary },
  chips: { gap: 9, paddingVertical: 1, paddingRight: 4 },
  iconBox: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.cardTitle, fontSize: 13, color: neutral[900] },
  sub: { ...typography.tiny, color: text.faint, marginTop: 2 },
  date: { ...typography.label, fontSize: 12, color: text.secondary },
});
