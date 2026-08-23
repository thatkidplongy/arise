import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GradeBar } from '@/components/Recall/GradeBar';
import { Chip, ChipRow, IndexCard, Pile } from '@/components/Recall/IndexCard';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { ApiRecall, RecallGrade } from '@/lib/api';
import { dayMonth } from '@/lib/dates';
import { STAT_META, font, neutral, text, withAlpha } from '@/theme';

const HUE = STAT_META.INT.color;

/** The front: the question, answered from memory before the card is turned. */
function Front({ item, onTurn }: { item: ApiRecall; onTurn: () => void }) {
  return (
    <>
      <Pile>
        <IndexCard
          face="front"
          kicker={item.chapter || undefined}
          meta={`written ${dayMonth(item.day)}`}
          metaRight={item.seen > 0 ? `seen ${item.seen}×` : undefined}
        >
          <Text style={styles.question}>{item.cue}</Text>
          <ChipRow>
            <Chip label="INT" fill={withAlpha(HUE, 0.16)} ink="#3F5C60" />
            {item.own_words ? <Chip label="your own words" /> : null}
          </ChipRow>
        </IndexCard>
      </Pile>
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
      <IndexCard
        face="back"
        kicker="The back"
        metaRight={source || undefined}
        ruleGap={26}
        footer={<Button label="Edit" tone="quiet" onPress={onEdit} />}
      >
        <Text style={styles.answer}>{item.text}</Text>
        {item.hook ? <Text style={styles.hook}>{item.hook}</Text> : null}
        {item.origin ? (
          <View style={styles.origin}>
            <Text style={styles.originKicker}>Where you met it</Text>
            <Text style={styles.originText}>{item.origin}</Text>
          </View>
        ) : null}
      </IndexCard>
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
  question: { fontFamily: font.display, fontSize: 19, lineHeight: 30, color: neutral[900] },
  sayIt: { fontFamily: font.regular, fontSize: 11.5, color: text.secondary, textAlign: 'center' },
  answer: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 26, color: neutral[900] },
  hook: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic', color: text.secondary },
  origin: { gap: 7, paddingTop: 2 },
  originKicker: { fontFamily: font.semibold, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: text.secondary },
  originText: { fontFamily: font.regular, fontSize: 12, lineHeight: 19, color: text.secondary },
});
