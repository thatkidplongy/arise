import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { ApiDailyQuote } from '@/lib/api';
import { fetchInsights } from '@/query/useInsights';
import { TAP_MIN, clay, font, neutral, radius, sage, surface, text, typography } from '@/theme';

/**
 * The two lines you carry, on one card with no fills.
 *
 * Edge-marked: a coloured rule down the side of each block does the sorting that a
 * tinted patch used to, so two very different things — the reason behind all of
 * this, and one line for today — can sit together without the page turning into a
 * stack of coloured boxes. There is no card behind them either; the rules are load
 * bearing, and the sand page shows through.
 */
export function NorthStarCard({ northStar, quote }: { northStar: string; quote: ApiDailyQuote | null }) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <NorthStar value={northStar} />
      </Pressable>
      {quote ? (
        <>
          <View style={styles.divider} />
          <DailyLine quote={quote} />
        </>
      ) : null}
    </View>
  );
}

/** One edge-marked block: the coloured rule, then everything it sorts. */
function Block({ edge, children }: PropsWithChildren<{ edge: string }>) {
  return (
    <View style={styles.block}>
      <View style={[styles.edge, { backgroundColor: edge }]} />
      <View style={styles.blockBody}>{children}</View>
    </View>
  );
}

function NorthStar({ value }: { value: string }) {
  const written = value.trim();
  // Everything after the first sentence reads as the quieter second line.
  const split = written.search(/(?<=[.!?])\s+/);
  const lead = split > 0 ? written.slice(0, split) : written;
  const rest = split > 0 ? written.slice(split).trim() : '';

  return (
    <Block edge={clay[400]}>
      <Text style={[styles.kicker, { color: clay[700] }]}>Your north star</Text>
      {written ? (
        <>
          <Text style={styles.starLead}>{lead}</Text>
          {rest ? <Text style={styles.starRest}>{rest}</Text> : null}
        </>
      ) : (
        <Text style={styles.starEmpty}>
          Write the life you&apos;re reaching for — the reason behind all of this. Tap to set it.
        </Text>
      )}
    </Block>
  );
}

/** Today's line, and a way to pull another from what you've captured. */
function DailyLine({ quote }: { quote: ApiDailyQuote }) {
  // Reset to the server's daily pick whenever it changes, the "adjust state during
  // render" way (no effect); shuffle can still swap `line` in between.
  const [line, setLine] = useState(quote.text);
  const [source, setSource] = useState(quote.source_title);
  const [seed, setSeed] = useState(quote.text);
  if (seed !== quote.text) {
    setSeed(quote.text);
    setLine(quote.text);
    setSource(quote.source_title);
  }

  const shuffle = async () => {
    const insights = await fetchInsights(); // cached, or lazy-loaded on first tap
    const pool = insights.flatMap((i) => i.quotes.map((q) => ({ q, title: i.summary })));
    const others = pool.filter((p) => p.q !== line);
    if (others.length === 0) return;
    const pick = others[Math.floor(Math.random() * others.length)];
    setLine(pick.q);
    setSource(pick.title);
  };

  return (
    <Block edge={sage[400]}>
      <Text style={[styles.kicker, { color: sage[700] }]}>A line to carry today</Text>
      <Text style={styles.quote}>“{line}”</Text>
      <View style={styles.actionRow}>
        <Pressable
          onPress={shuffle}
          accessibilityRole="button"
          style={({ pressed }) => [styles.another, pressed ? { backgroundColor: sage[100] } : null]}
        >
          <Ionicons name="refresh" size={14} color={sage[700]} />
          <Text style={styles.anotherText}>Another line</Text>
        </Pressable>
        {source ? (
          <Text style={styles.source} numberOfLines={1}>
            {source}
          </Text>
        ) : null}
      </View>
    </Block>
  );
}

const styles = StyleSheet.create({
  // No fill at all: on the sand page the two coloured rules are the whole structure,
  // so the block sits in the page gutter rather than on a card floated above it.
  card: { paddingVertical: 6 },
  pressed: { opacity: 0.85 },
  block: { flexDirection: 'row', gap: 16 },
  // The rule that does the sorting. It runs the height of its block, not the card.
  edge: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  blockBody: { flex: 1, minWidth: 0, gap: 10 },
  divider: { height: 1, backgroundColor: surface.hairline, marginVertical: 22 },
  kicker: { ...typography.kicker, fontSize: 11, letterSpacing: 1.5 },
  starLead: { ...typography.numeral, fontSize: 23, lineHeight: 31, color: neutral[900] },
  starRest: { ...typography.body, fontSize: 14, color: text.secondary, marginTop: -2 },
  starEmpty: { ...typography.body, fontSize: 14, color: text.secondary },
  quote: { fontFamily: font.regular, fontSize: 19, lineHeight: 28, color: neutral[900] },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  another: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: TAP_MIN,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: sage[400],
  },
  anotherText: { ...typography.button, color: sage[700] },
  source: { ...typography.small, flex: 1, minWidth: 0, color: text.secondary },
});
