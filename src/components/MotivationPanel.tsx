import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FailedCaptures } from '@/components/FailedCaptures';
import { CaptureCard } from '@/components/Inspire/CaptureCard';
import { InsightCard, TipsCard } from '@/components/Inspire/InsightCards';
import { PendingCard } from '@/components/Inspire/PendingCard';
import { TutorialCard } from '@/components/Inspire/TutorialCard';
import { shared } from '@/components/Inspire/shared';
import { Text, TextInput } from '@/components/ui/Text';
import type { InsightKind } from '@/lib/api';
import { describeCaptureBlock, duplicateOf, matches, viewOf } from '@/lib/capture';
import { useInsights } from '@/query/useInsights';
import { useCaptures } from '@/store/useCaptures';
import { useSystem } from '@/store/useSystem';
import { radius, surface, text, typography } from '@/theme';

/** How each view names its captures, draws them, and says it has none yet. */
const VIEWS: Record<InsightKind, { plural: string; empty: string; Card: typeof InsightCard }> = {
  motivation: {
    plural: 'motivations',
    empty: 'No motivation yet. Paste a talk that moved you — Arise keeps its takeaways and quotes, and one resurfaces on your Status.',
    Card: InsightCard,
  },
  tips: {
    plural: 'tips',
    empty: 'No tips yet. Paste a how-to video above — Arise pulls out a summary and takeaways you can act on.',
    Card: TipsCard,
  },
  tutorial: {
    plural: 'tutorials',
    empty: 'No tutorials yet. Paste a long video or an article above — Arise keeps its main points and steps, ready to copy into another AI.',
    Card: TutorialCard,
  },
};

export function MotivationPanel() {
  const state = useSystem((s) => s.state);
  const { insights, loaded, remove } = useInsights();
  const pending = useCaptures((s) => s.pending);
  const add = useCaptures((s) => s.add);
  const retry = useCaptures((s) => s.retry);
  const dismiss = useCaptures((s) => s.dismiss);

  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<InsightKind>('motivation');
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([]);

  const transcriptOn = state?.transcript_enabled ?? false;
  const llmOn = state?.llm_enabled ?? false;
  const ready = transcriptOn && llmOn;

  const trimmed = url.trim();
  const looksValid = /^https?:\/\//i.test(trimmed);
  const dup = duplicateOf(trimmed, mode, pending, insights);
  const canCapture = ready && looksValid && !dup;

  const statusMsg = describeCaptureBlock(trimmed, looksValid, dup);

  const capture = () => {
    if (!canCapture) return; // defense in depth (also guards the keyboard submit)
    add(trimmed, mode); // fire-and-forget; a pending card appears immediately
    setUrl('');
  };

  const toggle = (id: string) =>
    setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const q = query.trim().toLowerCase();
  const view = VIEWS[mode];
  // Each kind is its own view: the capture mode doubles as the active tab, so you
  // only see (and add) one kind at a time.
  const shownPending = pending.filter((p) => viewOf(p.kind) === mode);
  const shown = insights.filter((i) => viewOf(i.kind) === mode);
  const filtered = shown.filter((i) => matches(i, q));
  const Card = view.Card;

  return (
    <>
      <CaptureCard
        url={url}
        setUrl={setUrl}
        mode={mode}
        setMode={setMode}
        transcriptOn={transcriptOn}
        llmOn={llmOn}
        canCapture={canCapture}
        statusMsg={statusMsg}
        onCapture={capture}
      />

      {shownPending.map((p) => (
        <PendingCard key={p.tempId} item={p} onRetry={retry} onDismiss={dismiss} />
      ))}

      <FailedCaptures kind={mode} />

      {shown.length > 3 ? (
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={text.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={`Search ${shown.length} ${view.plural}…`}
            placeholderTextColor={text.faint}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={text.faint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loaded && shownPending.length === 0 && shown.length === 0 ? (
        <Text style={shared.empty}>{view.empty}</Text>
      ) : null}

      {q && filtered.length === 0 && shown.length > 0 ? (
        <Text style={shared.empty}>No {view.plural} match “{query}”.</Text>
      ) : null}

      {filtered.map((ins) => (
        <Card
          key={ins.id}
          insight={ins}
          expanded={openIds.includes(ins.id)}
          onToggle={() => toggle(ins.id)}
          onRemove={remove}
        />
      ))}
    </>
  );
}

// The paste-a-link card, kept separate so it reads cleanly above the library.
const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    backgroundColor: surface.muted,
  },
  searchInput: { ...typography.body, flex: 1, paddingVertical: 12 },

});
