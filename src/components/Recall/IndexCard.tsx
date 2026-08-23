import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { clay, font, neutral, radius, sage, shadow, surface, text, withAlpha } from '@/theme';

/** The ruled stock the card is printed on — one faint line per line of writing. */
export function Ruled({ gap }: { gap: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 14 }, (_, i) => (
        <View key={i} style={[styles.rule, { top: (i + 1) * gap }]} />
      ))}
    </View>
  );
}

/** The rest of the pile, peeking out behind — the card is one of a stack. Worn by
 * the side that asks, where the pile is still ahead of you. */
export function Pile({ children }: { children: ReactNode }) {
  return (
    <View style={styles.pileWrap}>
      <View style={[styles.behind, styles.behindFar]} />
      <View style={[styles.behind, styles.behindNear]} />
      {children}
    </View>
  );
}

/** A corner tag on a card — what it is, where it came from. */
export function Chip({ label, fill, ink }: { label: string; fill?: string; ink?: string }) {
  return (
    <Text style={[styles.chip, fill ? { backgroundColor: fill } : styles.chipPlain, ink ? { color: ink } : null]}>
      {label}
    </Text>
  );
}

/** A row of chips along the bottom of a card's body. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

/** Which side is showing: the one that asks, or the one that answers. */
export type Face = 'front' | 'back';

/**
 * One physical index card: a ruled body under a head naming the side and where the
 * card came from.
 *
 * Every pile is printed on this same stock — a highlight due today and a tip from a
 * capture are both cards, so a front looks like a front whichever pile it was drawn
 * from, and turning one over always lands on the same sage back.
 */
export function IndexCard({
  face,
  kicker,
  meta,
  metaRight,
  ruleGap = 30,
  footer,
  children,
}: {
  face: Face;
  kicker?: string;
  /** Sits beside the kicker. */
  meta?: string;
  /** Pushed to the far edge of the head. */
  metaRight?: string;
  ruleGap?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const skin = FACES[face];
  return (
    <View style={[styles.card, shadow.md]}>
      <View style={[styles.head, skin.head]}>
        {kicker ? <Text style={[styles.kicker, skin.kicker]}>{kicker}</Text> : null}
        {meta ? <Text style={[styles.meta, skin.meta]}>{meta}</Text> : null}
        {metaRight ? <Text style={[styles.meta, skin.meta, styles.metaRight]}>{metaRight}</Text> : null}
      </View>
      <View style={styles.body}>
        <Ruled gap={ruleGap} />
        {children}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const FACES = {
  front: {
    head: { borderBottomColor: clay[300] } as const,
    kicker: { color: clay[700] } as const,
    meta: { color: text.secondary } as const,
  },
  back: {
    head: { backgroundColor: surface.sagePatch, borderBottomColor: sage[300] } as const,
    kicker: { color: sage[800] } as const,
    meta: { color: sage[800] } as const,
  },
};

const styles = StyleSheet.create({
  pileWrap: { position: 'relative', paddingBottom: 10 },
  behind: { position: 'absolute', top: 5, bottom: 0, left: 5, right: 5, borderRadius: radius.md },
  behindFar: { top: 9, left: 8, right: 8, backgroundColor: surface.muted, transform: [{ rotate: '-1.1deg' }] },
  behindNear: { backgroundColor: surface.card, opacity: 0.8, transform: [{ rotate: '0.7deg' }] },
  card: { position: 'relative', borderRadius: radius.md, backgroundColor: surface.card, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 11,
    borderBottomWidth: 1,
  },
  kicker: { fontFamily: font.semibold, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  meta: { fontFamily: font.regular, fontSize: 10.5 },
  metaRight: { marginLeft: 'auto' },
  body: { position: 'relative', paddingHorizontal: 18, paddingVertical: 20, gap: 16, overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: withAlpha(neutral[300], 0.55) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    fontFamily: font.semibold,
    fontSize: 10.5,
    color: neutral[800],
    overflow: 'hidden',
  },
  chipPlain: { backgroundColor: surface.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
});
