import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { ApiDailyQuote } from '@/lib/api';
import { fetchInsights } from '@/query/useInsights';
import { clay, font, neutral, sage, surface, text, typography } from '@/theme';

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

/** One carryable line: what a capture said, or what it was telling you to do. */
interface Line {
  text: string;
  verbatim: boolean;
}

/** Today's line, and a way to pull another from what you've captured. */
function DailyLine({ quote }: { quote: ApiDailyQuote }) {
  // Reset to the server's daily pick whenever it changes, the "adjust state during
  // render" way (no effect); shuffle can still swap `line` in between.
  const [line, setLine] = useState<Line>({ text: quote.text, verbatim: quote.verbatim });
  const [seed, setSeed] = useState(quote.text);
  if (seed !== quote.text) {
    setSeed(quote.text);
    setLine({ text: quote.text, verbatim: quote.verbatim });
  }

  const shuffle = async () => {
    const insights = await fetchInsights(); // cached, or lazy-loaded on first tap
    // The same pool the server draws today's line from (insights._all_lines): a
    // takeaway is as worth carrying as a quote, and there are more of them. Shuffling
    // only quotes would mean a takeaway could arrive as the daily pick and then never
    // be reachable by tapping.
    const pool: Line[] = insights.flatMap((i) => [
      ...i.quotes.map((text) => ({ text, verbatim: true })),
      ...i.takeaways.map((text) => ({ text, verbatim: false })),
    ]);
    const others = pool.filter((l) => l.text !== line.text);
    if (others.length === 0) return;
    setLine(others[Math.floor(Math.random() * others.length)]);
  };

  // The whole block is the control, the way it was before this card existed: a quiet
  // lowercase line says so, and no button chrome competes with the quote it sits
  // under. An outlined pill here fought the card's own premise — that the coloured
  // rules are the only structure and the sand page shows through everything else.
  return (
    <Pressable
      onPress={shuffle}
      accessibilityRole="button"
      accessibilityLabel="Show another line"
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Block edge={sage[400]}>
        <Text style={[styles.kicker, { color: sage[700] }]}>A line to carry today</Text>
        {/* Quotation marks only around what was actually said. Wrapping a distilled
            takeaway in them would invent a speaker for the model's own words. */}
        <Text style={styles.quote}>{line.verbatim ? `“${line.text}”` : line.text}</Text>
        <Text style={styles.hint}>tap for another</Text>
      </Block>
    </Pressable>
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
  // Lowercase and quiet: an instruction, not a control. The block's own size is the
  // tap target, so nothing here needs TAP_MIN. marginTop keeps the spacing the row
  // that used to hold it had.
  hint: { ...typography.small, color: text.secondary, marginTop: 2 },
});
