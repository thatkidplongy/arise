import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GradeBar } from '@/components/Recall/GradeBar';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { ApiRecall, RecallGrade } from '@/lib/api';
import { dayMonth } from '@/lib/dates';
import { STAT_META, clay, font, neutral, radius, sage, shadow, surface, text, withAlpha } from '@/theme';

const HUE = STAT_META.INT.color;

/** The ruled stock the card is printed on — one faint line per line of writing. */
function Ruled({ gap }: { gap: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 14 }, (_, i) => (
        <View key={i} style={[styles.rule, { top: (i + 1) * gap }]} />
      ))}
    </View>
  );
}

/** The front: the question, answered from memory before the card is turned. */
function Front({ item, onTurn }: { item: ApiRecall; onTurn: () => void }) {
  return (
    <>
      <View style={styles.stackWrap}>
        {/* The rest of the pile, peeking out behind — the card is one of a stack. */}
        <View style={[styles.behind, styles.behindFar]} />
        <View style={[styles.behind, styles.behindNear]} />
        <View style={[styles.card, shadow.md]}>
          <View style={styles.frontHead}>
            {item.chapter ? <Text style={styles.chapter}>{item.chapter}</Text> : null}
            <Text style={styles.headMeta}>written {dayMonth(item.day)}</Text>
            {item.seen > 0 ? <Text style={[styles.headMeta, styles.headRight]}>seen {item.seen}×</Text> : null}
          </View>
          <View style={styles.body}>
            <Ruled gap={30} />
            <Text style={styles.question}>{item.cue}</Text>
            <View style={styles.chips}>
              <Text style={[styles.chip, styles.chipStat]}>INT</Text>
              {item.own_words ? <Text style={[styles.chip, styles.chipPlain]}>your own words</Text> : null}
            </View>
          </View>
        </View>
      </View>
      <Button label="Turn the card over" onPress={onTurn} block large />
      <Text style={styles.sayIt}>Say it out loud first — then check.</Text>
    </>
  );
}

/** The back: the answer in your words, where it was born, and the grade. */
function Back({
  item,
  onGrade,
  onEdit,
}: {
  item: ApiRecall;
  onGrade: (grade: RecallGrade) => void;
  onEdit: () => void;
}) {
  const source = [item.material, item.chapter].filter(Boolean).join(' · ');
  return (
    <>
      <View style={[styles.card, shadow.md]}>
        <View style={styles.backHead}>
          <Text style={styles.backKicker}>The back</Text>
          {source ? <Text style={[styles.backMeta, styles.headRight]}>{source}</Text> : null}
        </View>
        <View style={styles.body}>
          <Ruled gap={26} />
          <Text style={styles.answer}>{item.text}</Text>
          {item.hook ? <Text style={styles.hook}>{item.hook}</Text> : null}
          {item.origin ? (
            <View style={styles.origin}>
              <Text style={styles.originKicker}>Where you met it</Text>
              <Text style={styles.originText}>{item.origin}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Button label="Edit" tone="quiet" onPress={onEdit} />
        </View>
      </View>
      <GradeBar ifMissed={item.if_missed} ifShaky={item.if_shaky} ifGot={item.if_got} onGrade={onGrade} />
    </>
  );
}

/**
 * One highlight as a physical index card. The front asks; turning it over is the
 * only way to the answer, so the recall attempt actually happens. A card distilled
 * before cues existed has no front to ask — it opens on its back, already turned.
 */
export function FlashCard({
  item,
  onGrade,
  onEdit,
}: {
  item: ApiRecall;
  onGrade: (grade: RecallGrade) => void;
  onEdit: () => void;
}) {
  const [turned, setTurned] = useState(!item.cue);
  if (!turned) return <Front item={item} onTurn={() => setTurned(true)} />;
  return <Back item={item} onGrade={onGrade} onEdit={onEdit} />;
}

const styles = StyleSheet.create({
  stackWrap: { position: 'relative', paddingBottom: 10 },
  behind: { position: 'absolute', top: 5, bottom: 0, left: 5, right: 5, borderRadius: radius.md },
  behindFar: { top: 9, left: 8, right: 8, backgroundColor: surface.muted, transform: [{ rotate: '-1.1deg' }] },
  behindNear: { backgroundColor: surface.card, opacity: 0.8, transform: [{ rotate: '0.7deg' }] },
  card: { position: 'relative', borderRadius: radius.md, backgroundColor: surface.card, overflow: 'hidden' },
  frontHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: clay[300],
  },
  chapter: { fontFamily: font.semibold, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: clay[700] },
  headMeta: { fontFamily: font.regular, fontSize: 10.5, color: text.secondary },
  headRight: { marginLeft: 'auto' },
  backHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: surface.sagePatch,
    borderBottomWidth: 1,
    borderBottomColor: sage[300],
  },
  backKicker: { fontFamily: font.semibold, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: sage[800] },
  backMeta: { fontFamily: font.regular, fontSize: 10.5, color: sage[800] },
  body: { position: 'relative', paddingHorizontal: 18, paddingVertical: 20, gap: 16, overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: withAlpha(neutral[300], 0.55) },
  question: { fontFamily: font.display, fontSize: 19, lineHeight: 30, color: neutral[900] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    fontFamily: font.semibold,
    fontSize: 10.5,
    overflow: 'hidden',
  },
  chipStat: { backgroundColor: withAlpha(HUE, 0.16), color: '#3F5C60' },
  chipPlain: { backgroundColor: surface.muted, color: neutral[800] },
  sayIt: { fontFamily: font.regular, fontSize: 11.5, color: text.secondary, textAlign: 'center' },
  answer: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 26, color: neutral[900] },
  hook: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic', color: text.secondary },
  origin: { gap: 7, paddingTop: 2 },
  originKicker: { fontFamily: font.semibold, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: text.secondary },
  originText: { fontFamily: font.regular, fontSize: 12, lineHeight: 19, color: text.secondary },
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
