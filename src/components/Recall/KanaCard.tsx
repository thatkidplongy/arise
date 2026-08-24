import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GradeBar } from '@/components/Recall/GradeBar';
import { Chip, ChipRow, IndexCard, Pile } from '@/components/Recall/IndexCard';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { RecallGrade } from '@/lib/api';
import type { KanaItem } from '@/lib/kana';
import { KANA_GROUPS, breakKanaWord, describeKanaBuild } from '@/lib/kanaChart';
import { STAT_META, font, kanaFont, neutral, radius, surface, text, withAlpha } from '@/theme';

const HUE = STAT_META.INT.color;

/** The front: the character, and nothing that would give the sound away. */
function Front({ item, onTurn }: { item: KanaItem; onTurn: () => void }) {
  return (
    <>
      <Pile>
        <IndexCard
          face="front"
          kicker="Hiragana"
          meta={KANA_GROUPS[item.group]}
          metaRight={item.fresh ? 'new' : `seen ${item.seen}×`}
          ruleGap={38}
        >
          <View style={styles.glyphWrap}>
            <Text style={styles.glyph}>{item.char}</Text>
          </View>
          <ChipRow>
            <Chip label="INT" fill={withAlpha(HUE, 0.16)} ink="#3F5C60" />
            <Chip label={item.fresh ? 'first time' : `${item.row.label} row`} />
          </ChipRow>
        </IndexCard>
      </Pile>
      <Button label="Turn the card over" onPress={onTurn} block large />
      <Text style={styles.hint}>
        {item.fresh
          ? 'You haven’t met this one — turn it over and read it aloud.'
          : 'Say the sound out loud first — then check.'}
      </Text>
    </>
  );
}

/** The row the character sits in, with this one marked — a character learns faster
 * beside its neighbours than alone, and the row is how the chart is taught. */
function RowStrip({ item }: { item: KanaItem }) {
  return (
    <View style={styles.row}>
      {item.row.chars.map((char, at) => (
        <View key={char} style={[styles.cell, char === item.char && styles.cellHere]}>
          <Text style={[styles.cellChar, char === item.char && styles.cellCharHere]}>{char}</Text>
          <Text style={styles.cellRomaji}>{item.row.romaji[at]}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A real word the character turns up in, taken apart piece by piece.
 *
 * The row above already gives the sound; what it can't give is the reading. A small
 * つ swallowing a beat, a う holding the vowel before it rather than sounding, a small
 * ゃ fusing two characters into one syllable — none of that exists until the character
 * sits in a word, and all of it is where a beginner stalls. The breakdown is derived
 * from the chart (see breakKanaWord), so it names the actual rule rather than a gloss
 * written out per word.
 */
function InWord({ item }: { item: KanaItem }) {
  if (!item.word) return null;
  const units = breakKanaWord(item.word.word);
  return (
    <View style={styles.word}>
      <Text style={styles.wordKicker}>In a word</Text>
      <View style={styles.wordHead}>
        <Text style={styles.wordChars}>{item.word.word}</Text>
        <View style={styles.wordSense}>
          <Text style={styles.wordRomaji}>{item.word.romaji}</Text>
          <Text style={styles.wordGloss}>{item.word.gloss}</Text>
        </View>
      </View>
      {units.map((unit, at) => (
        <View key={`${unit.chars}-${at}`} style={styles.unit}>
          <Text style={[styles.unitChars, unit.chars === item.char && styles.unitHere]}>{unit.chars}</Text>
          <Text style={styles.unitSays}>{unit.says}</Text>
        </View>
      ))}
    </View>
  );
}

/** The back: the sound, the row it belongs to, how it's built, a word, and the grade. */
function Back({ item, onGrade }: { item: KanaItem; onGrade: (grade: RecallGrade) => void }) {
  const build = describeKanaBuild(item);
  return (
    <>
      <IndexCard face="back" kicker="The back" metaRight={`${item.row.label} row`} ruleGap={26}>
        <Text style={styles.romaji}>{item.romaji}</Text>
        <RowStrip item={item} />
        {build ? <Text style={styles.build}>{build}</Text> : null}
        {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
        <InWord item={item} />
      </IndexCard>
      <GradeBar ifMissed={item.ifMissed} ifShaky={item.ifShaky} ifGot={item.ifGot} onGrade={onGrade} />
    </>
  );
}

/**
 * One hiragana character on the same physical index card the highlights use — the
 * character on the front, its sound on the back, and the same three grades moving it
 * up or down the ladder.
 *
 * Recognition only, and deliberately so: reading is what unlocks a real sentence, and
 * the writing half already has a home — the Japanese quest hands out a tracing sheet.
 * A card that asked both ways would be two cards pretending to be one.
 */
export function KanaCard({ item, onGrade }: { item: KanaItem; onGrade: (grade: RecallGrade) => void }) {
  const [turned, setTurned] = useState(false);
  if (!turned) return <Front item={item} onTurn={() => setTurned(true)} />;
  return <Back item={item} onGrade={onGrade} />;
}

const styles = StyleSheet.create({
  glyphWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  glyph: { fontFamily: kanaFont, fontSize: 88, lineHeight: 116, color: neutral[900] },
  hint: { fontFamily: font.regular, fontSize: 11.5, color: text.secondary, textAlign: 'center' },
  romaji: { fontFamily: font.display, fontSize: 40, lineHeight: 46, letterSpacing: -0.8, color: neutral[900] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cell: { minWidth: 42, alignItems: 'center', gap: 1, paddingVertical: 5, borderRadius: 8 },
  cellHere: { backgroundColor: withAlpha(HUE, 0.16) },
  cellChar: { fontFamily: kanaFont, fontSize: 19, lineHeight: 25, color: text.secondary },
  cellCharHere: { color: neutral[900] },
  cellRomaji: { fontFamily: font.regular, fontSize: 9.5, lineHeight: 13, color: text.faint },
  build: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 20, color: text.secondary },
  note: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 18, fontStyle: 'italic', color: text.onClay },
  word: { gap: 8, padding: 13, borderRadius: radius.md, backgroundColor: surface.muted },
  wordKicker: {
    fontFamily: font.semibold,
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: text.secondary,
  },
  wordHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  wordChars: { fontFamily: kanaFont, fontSize: 27, lineHeight: 36, color: neutral[900] },
  // minWidth:0 so a long gloss wraps instead of pushing the word off the row.
  wordSense: { flex: 1, minWidth: 0 },
  wordRomaji: { fontFamily: font.semibold, fontSize: 13.5, lineHeight: 19, color: neutral[900] },
  wordGloss: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, color: text.secondary },
  unit: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  unitChars: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: surface.card,
    fontFamily: kanaFont,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    color: text.secondary,
    overflow: 'hidden',
  },
  unitHere: { backgroundColor: withAlpha(HUE, 0.18), color: neutral[900] },
  unitSays: { flex: 1, minWidth: 0, fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, color: text.secondary },
});
