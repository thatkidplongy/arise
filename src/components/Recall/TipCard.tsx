import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Chip, ChipRow, IndexCard, Pile } from '@/components/Recall/IndexCard';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { BringBack } from '@/lib/bringBack';
import { dayMonth } from '@/lib/dates';
import { clay, font, neutral, text, withAlpha } from '@/theme';

type Tip = Extract<BringBack, { kind: 'tip' }>;

/** The front: the capture, asked. The tip itself is behind the card, not on it. */
function Front({ tip, onTurn }: { tip: Tip; onTurn: () => void }) {
  return (
    <>
      <Pile>
        <IndexCard face="front" kicker="From your tips" metaRight={`saved ${dayMonth(tip.day)}`}>
          <Text style={styles.cue}>{tip.cue}</Text>
          <ChipRow>
            <Chip label={tip.platform} fill={withAlpha(clay[400], 0.2)} ink={clay[800]} />
            <Chip label={tip.action ? 'to do' : 'idea'} />
          </ChipRow>
        </IndexCard>
      </Pile>
      <Button label="Turn the card over" onPress={onTurn} block large />
      <Text style={styles.hint}>The cue is written from the source, so you retrieve instead of read.</Text>
    </>
  );
}

/** The back: the tip, and the way on. Nothing to grade — a tip has no ladder. */
function Back({ tip, onNext }: { tip: Tip; onNext: () => void }) {
  return (
    <>
      <IndexCard face="back" kicker="The back" metaRight={tip.source} ruleGap={26}>
        <Text style={styles.answer}>{tip.text}</Text>
        <Text style={styles.kind}>
          {tip.action ? 'Something you said you would do.' : 'An idea worth keeping.'}
        </Text>
      </IndexCard>
      <Button label="Next card" tone="secondary" onPress={onNext} block />
    </>
  );
}

/**
 * One line from a tips capture, on the same index card as a highlight — because it
 * is the same act. It used to be a flat panel with the tip printed on the face,
 * which meant the only thing you ever did with it was read it, and reading is what
 * recall is supposed to replace.
 *
 * Two-sided fixes that, and the cue is the source: a tip arrives as an answer with
 * no question, so the capture it came from asks it. Grading is still absent —
 * nothing schedules a tip, so the back offers the pile rather than a ladder.
 */
export function TipCard({ tip, onNext }: { tip: Tip; onNext: () => void }) {
  const [turned, setTurned] = useState(false);
  if (!turned) return <Front tip={tip} onTurn={() => setTurned(true)} />;
  return <Back tip={tip} onNext={onNext} />;
}

const styles = StyleSheet.create({
  cue: { fontFamily: font.display, fontSize: 19, lineHeight: 30, color: neutral[900] },
  hint: { fontFamily: font.regular, fontSize: 11.5, color: text.secondary, textAlign: 'center' },
  answer: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 26, color: neutral[900] },
  kind: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic', color: text.secondary },
});
