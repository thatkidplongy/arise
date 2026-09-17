import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { StudyButton } from '@/components/Study/StudyButton';
import { Text } from '@/components/ui/Text';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import type { ApiStudy } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { press, radius, text, withAlpha } from '@/theme';

/** What's coming once you log this one — logging is what moves you on, so there's no
 * separate button to press. */
function UpNext({ next }: { next: string }) {
  if (!next) return null;
  return <Text style={styles.nowNext}>Log this one and you’re on to {next}</Text>;
}

function PhaseCovered() {
  return <Text style={styles.nowNext}>Every piece of this phase is ticked off.</Text>;
}

/** Steps back to the piece before this one — for a chapter that wants a second
 * sitting, or a log you didn't mean to move you on. */
function UndoTick() {
  const finishStudyPiece = useSystem((s) => s.finishStudyPiece);
  return (
    <Pressable
      onPress={() => void finishStudyPiece(false)}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [styles.undo, pressed && { opacity: press.strong }]}
    >
      <Ionicons name="arrow-undo-outline" size={12} color={text.secondary} />
      <Text style={styles.undoText}>Back to the one before</Text>
    </Pressable>
  );
}

/** Where the material for this step lives, when the plan knows — the walks point at a
 * chart, a guide or a book, the way every learning quest does. */
function StepResource({ resource }: { resource: string }) {
  if (!resource) return null;
  return <Text style={styles.resource}>{resource}</Text>;
}

/** The tinted box both subjects put their open piece in, so a Tuesday and a Wednesday
 * read as the same card wearing a different colour. */
function OpenBox({ hue, icon, label, children }: {
  hue: string;
  icon: 'document-text' | 'flag';
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[styles.open, { backgroundColor: withAlpha(hue, 0.08), borderColor: withAlpha(hue, 0.25) }]}
    >
      <Ionicons name={icon} size={15} color={hue} />
      <View style={styles.openBody}>
        <Text style={[styles.openLabel, { color: hue }]}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

/** Craft's open piece: the one source in front of you. The daily names this and
 * nothing else — the same way the reading daily names one book — so a sitting has one
 * place to be. */
export function NowStudying({ study, hue }: { study: ApiStudy; hue: string }) {
  const covered = study.done >= study.pieces;
  return (
    <OpenBox hue={hue} icon="document-text" label="NOW STUDYING">
      <Text style={styles.openTitle}>{study.source}</Text>
      {covered ? <PhaseCovered /> : <UpNext next={study.plan[study.done + 1] ?? ''} />}
      {study.done > 0 ? <UndoTick /> : null}
    </OpenBox>
  );
}

/** A walk's open step: what to do, spelled out. Craft's piece is a chapter and reads
 * as one line; these are exercises, so the card hands over the instructions rather
 * than making you open the quest to find them. */
export function NowWorking({ study, hue }: { study: ApiStudy; hue: string }) {
  return (
    <OpenBox hue={hue} icon="flag" label="THIS STEP">
      <Text style={styles.openTitle}>{study.piece}</Text>
      <Text style={styles.openDetail}>{study.detail}</Text>
      {study.steps.map((step) => (
        <Text key={step} style={styles.step}>
          · {step}
        </Text>
      ))}
      <StepResource resource={study.resource} />
      {study.done > 0 ? <UndoTick /> : null}
    </OpenBox>
  );
}

/** Saying you're through the step. Separate from logging a sitting on purpose: a step
 * can take three sittings, and only this says you're done with it. */
export function FinishStep({ hue }: { hue: string }) {
  const finishStudyPiece = useSystem((s) => s.finishStudyPiece);
  const save = useSaveState();

  return (
    <View style={styles.finish}>
      <StudyButton
        label={saveLabel(save.state, 'I’m through this step')}
        hue={hue}
        disabled={save.state === 'saving'}
        onPress={() => void save.run(() => finishStudyPiece(true))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  open: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 11,
  },
  openBody: { flex: 1, minWidth: 0, gap: 2 },
  openLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  openTitle: { color: text.primary, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  openDetail: { color: text.secondary, fontSize: 12, lineHeight: 17 },
  nowNext: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 8 },
  step: { color: text.primary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  resource: { color: text.faint, fontSize: 12, lineHeight: 17, marginTop: 8 },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  undoText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  finish: { marginTop: 12 },
});
