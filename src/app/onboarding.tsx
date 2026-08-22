import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field, TextArea } from '@/components/ui/Field';
import { StatChip } from '@/components/ui/StatChip';
import { Text } from '@/components/ui/Text';
import { useSystem } from '@/store/useSystem';
import { STAT_META, clay, neutral, radius, sage, surface, text, typography } from '@/theme';
import { STAT_KEYS } from '@/types';

/**
 * The first run: five steps, every one of them skippable.
 *
 * It asks for two things the app genuinely can't invent — what you're reaching for,
 * and what to call you — and spends the other three explaining that this is a guide
 * rather than a taskmaster. Nothing here can be got wrong, and Continue always
 * moves you on whether you filled anything in or not.
 */
const STEPS = 5;

export default function OnboardingScreen() {
  const state = useSystem((s) => s.state);
  const saveNorthStar = useSystem((s) => s.saveNorthStar);
  const saveName = useSystem((s) => s.saveName);
  const setOnboarded = useSystem((s) => s.setOnboarded);

  const [step, setStep] = useState(0);
  const [star, setStar] = useState(state?.player.north_star ?? '');
  const [name, setName] = useState(state?.player.name ?? '');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    // Only write what was actually filled in — a skipped step leaves things as they were.
    if (star.trim() && star.trim() !== state?.player.north_star) await saveNorthStar(star.trim());
    if (name.trim() && name.trim() !== state?.player.name) await saveName(name.trim());
    setOnboarded(true);
    setBusy(false);
    router.replace('/');
  };

  const next = () => (step === STEPS - 1 ? void finish() : setStep((s) => s + 1));

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        {step > 0 ? (
          <Pressable
            onPress={() => setStep((s) => s - 1)}
            accessibilityRole="button"
            accessibilityLabel="Back a step"
            style={styles.back}
          >
            <Text style={styles.backMark}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.dots}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i === step ? styles.dotOn : null]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {step === 0 ? <Welcome /> : null}
        {step === 1 ? <NorthStarStep value={star} onChange={setStar} /> : null}
        {step === 2 ? <SevenStep /> : null}
        {step === 3 ? <NameStep value={name} onChange={setName} /> : null}
        {step === 4 ? <ReadyStep rank={state?.player.rank ?? 'E'} /> : null}
      </ScrollView>

      <View style={styles.foot}>
        <Button
          label={step === STEPS - 1 ? 'Begin' : 'Continue'}
          onPress={next}
          busy={busy}
          block
          large
        />
        {step < STEPS - 1 ? (
          <Button label="Skip the rest" tone="ghost" block onPress={() => void finish()} />
        ) : null}
      </View>
    </View>
  );
}

function Welcome() {
  return (
    <>
      <View style={styles.mark}>
        <Text style={styles.markLetter}>A</Text>
      </View>
      <Text style={styles.hero}>A System{'\n'}for real life</Text>
      <Text style={styles.lede}>
        Seven areas of your life become seven attributes. You get quests, XP and ranks — but this is
        a guide, not a taskmaster.
      </Text>
      <View style={styles.bullets}>
        {[
          'Showing up at all is the win.',
          'Rest counts. Your streak survives it.',
          'There are no punishments. Anywhere.',
        ].map((line) => (
          <View key={line} style={styles.bullet}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{line}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function NorthStarStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Text style={styles.kicker}>Step one</Text>
      <Text style={styles.title}>What are you reaching for?</Text>
      <Text style={styles.lede}>
        This sits at the top of your Status screen, every day, as the reason behind all of it. You
        can change it whenever.
      </Text>
      <TextArea
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Someone I’m proud to see in the mirror — steady, curious, kind, still growing."
        maxLength={280}
        style={styles.area}
      />
      <Text style={styles.aside}>
        Not sure yet? Skip it — a quote you capture later can become your North Star in one tap.
      </Text>
    </>
  );
}

function SevenStep() {
  return (
    <>
      <Text style={styles.kicker}>Step two</Text>
      <Text style={styles.title}>Your seven</Text>
      <Text style={styles.lede}>
        One quest a day for each. Each one levels on its own, each one starts gentle — and the floor
        climbs only once you&apos;ve shown you own the current step.
      </Text>
      <View style={styles.tiles}>
        {STAT_KEYS.map((key) => (
          <View key={key} style={styles.tile}>
            <StatChip statKey={key} size={42} />
            <Text style={styles.tileLabel}>{STAT_META[key].label}</Text>
            <Text style={styles.tileLevel}>Lv 0</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Text style={styles.kicker}>Step three</Text>
      <Text style={styles.title}>What should the System call you?</Text>
      <Text style={styles.lede}>
        It goes on your Status window and nowhere else. No account, no sign-up — everything you log
        stays on your own machine.
      </Text>
      <Field value={value} onChangeText={onChange} placeholder="Your hunter name" maxLength={24} />
    </>
  );
}

function ReadyStep({ rank }: { rank: string }) {
  return (
    <>
      <View style={[styles.mark, styles.markSage]}>
        <Text style={[styles.markLetter, styles.markLetterSage]}>{rank}</Text>
      </View>
      <Text style={styles.hero}>You&apos;re {rank}-Rank.{'\n'}Everyone is.</Text>
      <Text style={styles.lede}>
        Level 1, no streak, seven quests waiting. The board is the same size whenever you come back
        to it, and a day you miss costs you nothing.
      </Text>
      <View style={styles.dashed}>
        <Text style={styles.dashedText}>
          You can run this again any time from Settings, and change every answer from there too.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.base },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 22, paddingTop: 12 },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMark: { ...typography.numeral, fontSize: 17, color: neutral[800], includeFontPadding: false },
  dots: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: surface.edge },
  dotOn: { width: 22, backgroundColor: clay[500] },
  body: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 30, gap: 18 },
  foot: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30, gap: 4 },
  mark: {
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    backgroundColor: clay[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  markSage: { backgroundColor: sage[300] },
  markLetter: { ...typography.numeral, fontSize: 40, color: clay[800], includeFontPadding: false },
  markLetterSage: { color: sage[800] },
  hero: { ...typography.numeral, fontSize: 42, lineHeight: 45, color: neutral[900] },
  kicker: { ...typography.kicker, color: clay[700], marginTop: 16 },
  title: { ...typography.numeral, fontSize: 32, lineHeight: 36, color: neutral[900] },
  lede: { ...typography.body, fontSize: 14.5, lineHeight: 24, color: text.secondary },
  aside: { ...typography.small, fontSize: 12.5, color: text.secondary },
  area: { minHeight: 130 },
  bullets: { gap: 14, marginTop: 4 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  bulletDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: sage[600], marginTop: 7 },
  bulletText: { ...typography.body, fontSize: 14, flex: 1, color: neutral[800] },
  tiles: { gap: 11 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 13,
    borderRadius: radius.md,
    backgroundColor: surface.card,
  },
  tileLabel: { ...typography.cardTitle, flex: 1, color: neutral[900] },
  tileLevel: { ...typography.numeral, fontSize: 16, color: text.secondary, includeFontPadding: false },
  dashed: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: surface.edge,
    borderRadius: radius.lg,
    padding: 20,
  },
  dashedText: { ...typography.body, color: text.secondary },
});
