import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { FailedCaptures } from '@/components/FailedCaptures';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Text, TextInput } from '@/components/ui/Text';
import type { ApiInsight, InsightKind } from '@/lib/api';
import { useInsights } from '@/query/useInsights';
import { useCaptures, type PendingCapture } from '@/store/useCaptures';
import { useSystem } from '@/store/useSystem';
import { TAP_MIN, accent, clay, feedback, radius, surface, text, typography } from '@/theme';

// Normalise a link so we can spot the same video pasted twice — mirrors the
// server's clean_url enough to guard against re-hitting the API for a dupe.
function canonical(raw: string): string {
  const u = raw.trim();
  const tt = u.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d+/i);
  if (tt) return tt[0].toLowerCase();
  const ig = u.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[\w-]+/i);
  if (ig) return ig[0].toLowerCase();
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `yt:${yt[1].toLowerCase()}`;
  return u.split('#')[0].split('?')[0].toLowerCase();
}

// A dupe only within the same mode — the backend keeps a video once per kind, so
// the same link can be captured as both Motivation and Tips.
function duplicateOf(
  url: string,
  kind: InsightKind,
  pending: PendingCapture[],
  insights: ApiInsight[],
): 'pending' | 'done' | null {
  if (!url) return null;
  const c = canonical(url);
  if (pending.some((p) => p.kind === kind && canonical(p.url) === c)) return 'pending';
  if (insights.some((i) => i.kind === kind && i.source_url && canonical(i.source_url) === c))
    return 'done';
  return null;
}

// Free-text filter across a capture's words (no creator/source attribution).
function matches(i: ApiInsight, q: string): boolean {
  if (!q) return true;
  return [i.summary, ...i.takeaways, ...i.steps, ...i.quotes].join(' ').toLowerCase().includes(q);
}

/** The footer shared by both card kinds: open the original, or remove it. */
function CardActions({
  sourceUrl,
  id,
  onRemove,
}: {
  sourceUrl: string;
  id: string;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.actions}>
      {sourceUrl ? (
        <Pressable
          onPress={() => Linking.openURL(sourceUrl).catch(() => {})}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          hitSlop={6}
        >
          <Ionicons name="open-outline" size={14} color={text.secondary} />
          <Text style={styles.actionText}>Open original</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onRemove(id)}
        style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        hitSlop={6}
      >
        <Ionicons name="trash-outline" size={14} color={feedback.danger} />
        <Text style={[styles.actionText, { color: feedback.danger }]}>Remove</Text>
      </Pressable>
    </View>
  );
}

function PendingCard({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingCapture;
  onRetry: (tempId: string) => void;
  onDismiss: (tempId: string) => void;
}) {
  const working = item.status === 'working';
  return (
    <View style={[styles.card, styles.pendingCard]}>
      <View style={styles.cardHead}>
        {working ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons name="alert-circle-outline" size={16} color={feedback.danger} />
        )}
        <Text style={styles.pendingTitle} numberOfLines={1}>
          {working
            ? item.kind === 'tips'
              ? 'Pulling out the tips…'
              : 'Listening & distilling…'
            : 'Couldn’t capture this one'}
        </Text>
        {!working ? (
          <Pressable onPress={() => onDismiss(item.tempId)} hitSlop={8}>
            <Text style={styles.remove}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.pendingUrl} numberOfLines={1}>
        {item.url}
      </Text>
      {!working && item.error ? <Text style={styles.error}>{item.error}</Text> : null}
      {!working ? (
        <Pressable
          onPress={() => onRetry(item.tempId)}
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InsightCard({
  insight,
  expanded,
  onToggle,
  onRemove,
}: {
  insight: ApiInsight;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const saveNorthStar = useSystem((s) => s.saveNorthStar);
  const [justSet, setJustSet] = useState<string | null>(null);

  const setAsNorthStar = async (quote: string) => {
    setJustSet(quote);
    await saveNorthStar(quote);
    setTimeout(() => setJustSet((q) => (q === quote ? null : q)), 2000);
  };

  const label = insight.summary || insight.quotes[0] || 'Captured video';

  return (
    <View style={styles.card}>
      <Pressable style={styles.rowHead} onPress={onToggle} hitSlop={4}>
        <Text style={styles.rowSummary} numberOfLines={expanded ? undefined : 2}>
          {label}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.takeaways.length > 0 ? (
            <View style={styles.takeaways}>
              <Text style={styles.sectionLabel}>TAKEAWAYS</Text>
              {insight.takeaways.map((t, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {insight.quotes.map((q, i) => (
            <View key={i} style={styles.quote}>
              <Text style={styles.quoteText}>“{q}”</Text>
              <Pressable
                onPress={() => setAsNorthStar(q)}
                style={({ pressed }) => [styles.starBtn, pressed && { opacity: 0.7 }]}
                hitSlop={6}
              >
                <Ionicons
                  name={justSet === q ? 'checkmark-circle' : 'compass-outline'}
                  size={13}
                  color={justSet === q ? feedback.success : accent}
                />
                <Text style={[styles.starText, justSet === q && { color: feedback.success }]}>
                  {justSet === q ? 'Set as North Star' : 'Make this my North Star'}
                </Text>
              </Pressable>
            </View>
          ))}

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove} />
        </>
      ) : null}
    </View>
  );
}

/** A captured how-to video: its summary (the header) + takeaways — the kept
 * information — each of which can also drop straight into your to-do list.
 * Collapsible like InsightCard, but no quotes / North Star. */
function TipsCard({
  insight,
  expanded,
  onToggle,
  onRemove,
}: {
  insight: ApiInsight;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const addReminder = useSystem((s) => s.addReminder);
  const [added, setAdded] = useState<number[]>([]);

  const sendToTodo = (step: string, i: number) => {
    if (added.includes(i)) return;
    setAdded((xs) => [...xs, i]);
    void addReminder(step);
  };

  const label = insight.summary || insight.takeaways[0] || 'Captured tips';

  return (
    <View style={styles.card}>
      <Pressable style={styles.rowHead} onPress={onToggle} hitSlop={4}>
        <Ionicons name="bulb-outline" size={16} color={feedback.gold} />
        <Text style={styles.rowSummary} numberOfLines={expanded ? undefined : 2}>
          {label}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.takeaways.length === 0 && insight.steps.length === 0 ? (
            <Text style={styles.empty}>Nothing came out of this one.</Text>
          ) : null}

          {/* The kept knowledge — the important part, just to read. */}
          {insight.takeaways.length > 0 ? (
            <View style={styles.takeaways}>
              <Text style={styles.sectionLabel}>TAKEAWAYS</Text>
              {insight.takeaways.map((t, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Optional concrete actions — each can drop into your to-do list. */}
          {insight.steps.length > 0 ? (
            <View style={styles.tips}>
              <Text style={styles.sectionLabel}>STEPS TO TRY</Text>
              {insight.steps.map((step, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipText}>{step}</Text>
                  <Pressable
                    onPress={() => sendToTodo(step, i)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.todoBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={added.includes(i) ? 'checkmark-circle' : 'add-circle-outline'}
                      size={14}
                      color={added.includes(i) ? feedback.success : accent}
                    />
                    <Text style={[styles.todoText, added.includes(i) && { color: feedback.success }]}>
                      {added.includes(i) ? 'Added' : 'To-do'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove} />
        </>
      ) : null}
    </View>
  );
}

/** The Inspire tab body: paste a video link, keep its distilled wisdom, and let a
 * quote resurface on Status. Captures run in the background (see useCaptures).
 * The library collapses to slim, tappable rows with a search filter so it stays
 * scannable at any size. Standalone — never touches XP.
 *
 * A link that didn't distil isn't dropped: the server keeps it, and FailedCaptures
 * sits between the capture card and the library so it's the first thing you see —
 * a shelf of things to try again, not an error you already missed. */
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

  // The API-wasting cases (empty, half-typed, already-captured) are all blocked
  // before a request goes out — the button greys out and says why.
  const statusMsg = !trimmed
    ? null
    : !looksValid
      ? 'Paste a full link — it should start with https://.'
      : dup === 'pending'
        ? 'That link is already being captured.'
        : dup === 'done'
          ? 'You’ve already captured that one — it’s in your list below.'
          : null;

  const capture = () => {
    if (!canCapture) return; // defense in depth (also guards the keyboard submit)
    add(trimmed, mode); // fire-and-forget; a pending card appears immediately
    setUrl('');
  };

  const toggle = (id: string) =>
    setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const q = query.trim().toLowerCase();
  const isTips = mode === 'tips';
  // Motivation and Tips are separate views: the capture mode doubles as the
  // active tab, so you only see (and add) one kind at a time.
  const shownPending = pending.filter((p) => (isTips ? p.kind === 'tips' : p.kind !== 'tips'));
  const shown = insights.filter((i) => (isTips ? i.kind === 'tips' : i.kind !== 'tips'));
  const filtered = shown.filter((i) => matches(i, q));

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
            placeholder={`Search ${shown.length} ${isTips ? 'tips' : 'motivations'}…`}
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
        <Text style={styles.empty}>
          {isTips
            ? 'No tips yet. Paste a how-to video above — Arise pulls out a summary and takeaways you can act on.'
            : 'No motivation yet. Paste a talk that moved you — Arise keeps its takeaways and quotes, and one resurfaces on your Status.'}
        </Text>
      ) : null}

      {q && filtered.length === 0 && shown.length > 0 ? (
        <Text style={styles.empty}>No {isTips ? 'tips' : 'motivations'} match “{query}”.</Text>
      ) : null}

      {filtered.map((ins) =>
        isTips ? (
          <TipsCard
            key={ins.id}
            insight={ins}
            expanded={openIds.includes(ins.id)}
            onToggle={() => toggle(ins.id)}
            onRemove={remove}
          />
        ) : (
          <InsightCard
            key={ins.id}
            insight={ins}
            expanded={openIds.includes(ins.id)}
            onToggle={() => toggle(ins.id)}
            onRemove={remove}
          />
        ),
      )}
    </>
  );
}

// The paste-a-link card, kept separate so it reads cleanly above the library.
function CaptureCard({
  url,
  setUrl,
  mode,
  setMode,
  transcriptOn,
  llmOn,
  canCapture,
  statusMsg,
  onCapture,
}: {
  url: string;
  setUrl: (v: string) => void;
  mode: InsightKind;
  setMode: (m: InsightKind) => void;
  transcriptOn: boolean;
  llmOn: boolean;
  canCapture: boolean;
  statusMsg: string | null;
  onCapture: () => void;
}) {
  const tips = mode === 'tips';
  return (
    <SystemPanel title="Capture" sub="TikTok · Reels · YouTube">
      <View style={styles.modeRow}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'motivation', label: 'Motivation' },
            { value: 'tips', label: 'Tips' },
          ]}
        />
      </View>
      <Text style={styles.help}>
        {tips
          ? 'For a how-to or advice video. Arise pulls out the practical steps worth keeping — and you can drop any step straight into your to-do list.'
          : 'For something that moved you. Arise distils it into a few takeaways and quotes worth keeping — one resurfaces on your Status now and then.'}
        {' '}It runs in the background (~8s), so you can paste another or leave this tab.
      </Text>
      <Field
        value={url}
        onChangeText={setUrl}
        onSubmitEditing={onCapture}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        placeholder="Paste a TikTok, Reel or YouTube link"
      />
      <Button
        label={tips ? 'Capture tips' : 'Capture'}
        onPress={onCapture}
        disabled={!canCapture}
        block
        large
      />
      {!transcriptOn ? (
        <Text style={styles.gate}>
          Add a free Supadata key (ARISE_SUPADATA_API_KEY) on the server to enable this.
        </Text>
      ) : !llmOn ? (
        <Text style={styles.gate}>Distilling needs your Gemini key (ARISE_LLM_API_KEY).</Text>
      ) : null}
      {statusMsg ? <Text style={styles.hint}>{statusMsg}</Text> : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  help: { ...typography.small, color: text.secondary, marginBottom: 14 },

  modeRow: { marginBottom: 14 },


  tips: { gap: 8 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: surface.muted,
    borderRadius: radius.md,
    padding: 13,
  },
  tipText: { ...typography.body, flex: 1 },
  todoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  todoText: { color: accent, fontSize: 12, fontWeight: '700' },
  input: { marginBottom: 12 },
  gate: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  hint: { color: text.faint, fontSize: 12, lineHeight: 17, marginTop: 10 },
  error: { color: feedback.danger, fontSize: 12, lineHeight: 17 },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },

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

  card: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 12,
  },
  pendingCard: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: surface.edge,
  },
  pendingTitle: { ...typography.cardTitle, flex: 1 },
  pendingUrl: { ...typography.small, color: text.faint },
  retryBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingVertical: 9,
    alignItems: 'center',
  },
  retryText: { color: accent, fontSize: 13, fontWeight: '700' },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remove: { color: text.faint, fontSize: 22, fontWeight: '700', marginTop: -4 },

  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowSummary: { ...typography.numeral, flex: 1, fontSize: 17, lineHeight: 23 },

  takeaways: { gap: 6 },
  sectionLabel: { ...typography.kicker, color: text.secondary },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { color: accent, fontSize: 14, lineHeight: 20 },
  bulletText: { ...typography.body, lineHeight: 21, flex: 1 },
  quote: {
    backgroundColor: clay[100],
    borderRadius: radius.md,
    padding: 16,
    gap: 10,
  },
  quoteText: { ...typography.numeral, fontSize: 18, lineHeight: 26, color: clay[800] },
  starBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  starText: { color: accent, fontSize: 12, fontWeight: '600' },

  actions: {
    flexDirection: 'row',
    gap: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
});
