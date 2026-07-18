import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import type { ApiInsight } from '@/lib/api';
import { useMotivation, type PendingCapture } from '@/store/useMotivation';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text, withAlpha } from '@/theme';

const SOURCE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
  youtube: 'logo-youtube',
  web: 'link-outline',
};

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

function duplicateOf(
  url: string,
  pending: PendingCapture[],
  insights: ApiInsight[],
): 'pending' | 'done' | null {
  if (!url) return null;
  const c = canonical(url);
  if (pending.some((p) => canonical(p.url) === c)) return 'pending';
  if (insights.some((i) => i.source_url && canonical(i.source_url) === c)) return 'done';
  return null;
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
          {working ? 'Listening & distilling…' : 'Couldn’t capture this one'}
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

function InsightCard({ insight, onRemove }: { insight: ApiInsight; onRemove: (id: string) => void }) {
  const saveNorthStar = useSystem((s) => s.saveNorthStar);
  const [justSet, setJustSet] = useState<string | null>(null);

  const setAsNorthStar = async (quote: string) => {
    setJustSet(quote);
    await saveNorthStar(quote);
    setTimeout(() => setJustSet((q) => (q === quote ? null : q)), 2000);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={SOURCE_ICON[insight.source] ?? 'link-outline'} size={16} color={accent} />
        <Pressable
          style={styles.cardTitleTap}
          onPress={() => insight.source_url && Linking.openURL(insight.source_url).catch(() => {})}
        >
          <Text style={styles.cardTitle} numberOfLines={1}>
            {insight.title || 'Captured video'}
          </Text>
        </Pressable>
        <Pressable onPress={() => onRemove(insight.id)} hitSlop={8}>
          <Text style={styles.remove}>×</Text>
        </Pressable>
      </View>

      {insight.summary ? <Text style={styles.summary}>{insight.summary}</Text> : null}

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
    </View>
  );
}

/** The Inspire tab body: paste a video link, keep its distilled wisdom, and let a
 * quote resurface on Status. Captures run in the background (see useMotivation),
 * so you can queue several or leave the tab. Standalone — never touches XP. */
export function MotivationPanel() {
  const state = useSystem((s) => s.state);
  const insights = useMotivation((s) => s.insights);
  const pending = useMotivation((s) => s.pending);
  const loaded = useMotivation((s) => s.loaded);
  const fetch = useMotivation((s) => s.fetch);
  const add = useMotivation((s) => s.add);
  const retry = useMotivation((s) => s.retry);
  const dismiss = useMotivation((s) => s.dismiss);
  const remove = useMotivation((s) => s.remove);

  const [url, setUrl] = useState('');

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const transcriptOn = state?.transcript_enabled ?? false;
  const llmOn = state?.llm_enabled ?? false;
  const ready = transcriptOn && llmOn;

  const trimmed = url.trim();
  const looksValid = /^https?:\/\//i.test(trimmed);
  const dup = duplicateOf(trimmed, pending, insights);
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
    add(trimmed); // fire-and-forget; a pending card appears immediately
    setUrl('');
  };

  return (
    <>
      <CaptureCard
        url={url}
        setUrl={setUrl}
        ready={ready}
        transcriptOn={transcriptOn}
        llmOn={llmOn}
        canCapture={canCapture}
        statusMsg={statusMsg}
        onCapture={capture}
      />

      {pending.map((p) => (
        <PendingCard key={p.tempId} item={p} onRetry={retry} onDismiss={dismiss} />
      ))}

      {loaded && pending.length === 0 && insights.length === 0 ? (
        <Text style={styles.empty}>
          Nothing captured yet. Paste a link to a talk that moved you — its lessons will live here,
          and a line will find its way to your Status.
        </Text>
      ) : null}

      {insights.map((ins) => (
        <InsightCard key={ins.id} insight={ins} onRemove={remove} />
      ))}
    </>
  );
}

// The paste-a-link card, kept separate so it reads cleanly above the library.
function CaptureCard({
  url,
  setUrl,
  ready,
  transcriptOn,
  llmOn,
  canCapture,
  statusMsg,
  onCapture,
}: {
  url: string;
  setUrl: (v: string) => void;
  ready: boolean;
  transcriptOn: boolean;
  llmOn: boolean;
  canCapture: boolean;
  statusMsg: string | null;
  onCapture: () => void;
}) {
  return (
    <SystemPanel title="Capture a video" sub="TikTok · Reels · YouTube">
      <Text style={styles.help}>
        Paste a link to something that spoke to you. Arise pulls what was said and distils it into a
        few takeaways and quotes worth keeping — one resurfaces on your Status now and then. It runs
        in the background (~8s), so you can paste another or leave this tab.
      </Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        onSubmitEditing={onCapture}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        placeholder="Paste a TikTok, Reel or YouTube link"
        placeholderTextColor={text.faint}
      />
      <Pressable
        disabled={!canCapture}
        style={({ pressed }) => [
          styles.btn,
          pressed && { opacity: 0.8 },
          !canCapture && styles.btnDisabled,
        ]}
        onPress={onCapture}
      >
        <Text style={styles.btnText}>Capture</Text>
      </Pressable>
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
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: surface.base,
  },
  btn: { backgroundColor: accent, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#FBF5EB', fontSize: 14, fontWeight: '700' },
  gate: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  hint: { color: text.faint, fontSize: 12, lineHeight: 17, marginTop: 10 },
  error: { color: feedback.danger, fontSize: 12, lineHeight: 17 },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },

  card: {
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 11,
    padding: 14,
    gap: 10,
  },
  pendingCard: { borderStyle: 'dashed', borderColor: withAlpha(accent, 0.5) },
  pendingTitle: { color: text.primary, fontSize: 14, fontWeight: '700', flex: 1 },
  pendingUrl: { color: text.faint, fontSize: 12 },
  retryBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  retryText: { color: accent, fontSize: 13, fontWeight: '700' },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitleTap: { flex: 1 },
  cardTitle: { color: text.primary, fontSize: 14, fontWeight: '700' },
  remove: { color: text.faint, fontSize: 22, fontWeight: '700', marginTop: -4 },
  summary: { color: text.secondary, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  takeaways: { gap: 6 },
  sectionLabel: { color: text.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { color: accent, fontSize: 14, lineHeight: 20 },
  bulletText: { color: text.primary, fontSize: 13, lineHeight: 20, flex: 1 },
  quote: {
    backgroundColor: withAlpha(feedback.gold, 0.09),
    borderLeftWidth: 3,
    borderLeftColor: feedback.gold,
    borderRadius: 9,
    padding: 11,
    gap: 8,
  },
  quoteText: { color: text.primary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  starBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  starText: { color: accent, fontSize: 12, fontWeight: '600' },
});
