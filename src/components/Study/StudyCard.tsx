import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChangeSource, PhaseReview, PickSource } from '@/components/Study/CraftSource';
import { FinishStep, NowStudying, NowWorking } from '@/components/Study/OpenPiece';
import { StudyLog } from '@/components/Study/StudyLog';
import { SystemPanel } from '@/components/SystemPanel';
import { Text } from '@/components/ui/Text';
import { XpBar } from '@/components/XpBar';
import { useCollapse } from '@/hooks/useCollapse';
import type { ApiStudy } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { STAT_META, feedback, press, surface, text } from '@/theme';

/** The last line under the bar — the one thing the three subjects say differently: a
 * phase holds until you say it's read, a walk simply carries on. */
function ProgressNote({ study }: { study: ApiStudy }) {
  if (study.subject === 'craft') {
    return (
      <Text style={styles.meta}>
        {study.is_last
          ? 'The last phase — design reps carry on for as long as you want them to.'
          : 'This phase holds until you say it’s read. Nothing here is on a clock.'}
      </Text>
    );
  }
  return (
    <Text style={styles.meta}>
      {study.is_last
        ? 'The end of the plan — this last one is the kind you keep doing.'
        : 'One step at a time, at whatever pace suits you. Nothing here expires.'}
    </Text>
  );
}

function StretchProgress({ study, hue }: { study: ApiStudy; hue: string }) {
  const covered = study.done >= study.pieces;
  return (
    <>
      <View style={styles.tallyRow}>
        <Text style={styles.tallyLabel}>Covered in this {study.unit.toLowerCase()}</Text>
        <Text style={styles.tallyValue}>
          {study.done} / {study.pieces}
        </Text>
      </View>
      <XpBar
        value={Math.min(study.done, study.pieces)}
        max={study.pieces}
        color={covered ? feedback.success : hue}
        height={8}
      />
      <ProgressNote study={study} />
    </>
  );
}

/** Source, today's sitting, and moving on — the same three parts as the book, in the
 * same order, so both loops read the same way. */
function SourceSection({ study, hue }: { study: ApiStudy; hue: string }) {
  const { open, toggle } = useCollapse(true, true);
  return (
    <>
      <NowStudying study={study} hue={hue} />
      <StudyLog study={study} hue={hue} />

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.disclose, pressed && { opacity: press.strong }]}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={text.faint} />
        <Text style={styles.discloseLabel}>Change what I’m studying</Text>
      </Pressable>
      {open ? <ChangeSource current={study.source} hue={hue} /> : null}
    </>
  );
}

/** System design: a phase, a source you pick, and a check-in when the phase is
 * covered. Advanced by logging a sitting against the piece you're holding. */
function CraftBody({ study, hue }: { study: ApiStudy; hue: string }) {
  if (!study.source) return <PickSource hue={hue} />;
  return <SourceSection study={study} hue={hue} />;
}

/** Japanese and drawing: a position along a fixed walk. The plan names the step, so
 * there's nothing to pick — you work it, log it, and say when you're through. */
function WalkBody({ study, hue }: { study: ApiStudy; hue: string }) {
  return (
    <>
      <NowWorking study={study} hue={hue} />
      <StudyLog study={study} hue={hue} />
      <FinishStep hue={hue} />
    </>
  );
}

function StudyBody({ study, hue }: { study: ApiStudy; hue: string }) {
  if (study.subject === 'craft') return <CraftBody study={study} hue={hue} />;
  return <WalkBody study={study} hue={hue} />;
}

/**
 * The one thing being worked through today, whichever of the three it is.
 *
 * The board alternates — system design Mon/Wed/Fri, Japanese Tue/Sat, drawing Thu/Sun
 * — and this card follows it rather than sitting on system design every morning, which
 * is what it used to do: six mornings a week it named a subject the day wasn't on and
 * hid the two it was. Which subject today carries is the backend's answer (see
 * `state.study_of`), so the schedule has one owner and Learn can't disagree with the
 * board.
 *
 * The colour is the subject's attribute — Craft blue, Grow teal, Creativity amber — so
 * the card says which part of the week you're in before you've read it.
 *
 * Progress is what you've covered, never weeks elapsed: a plan that advanced by date
 * would march you past material you hadn't opened.
 */
export function StudyCard() {
  const study = useSystem((s) => s.state?.study);
  if (!study) return null;

  const hue = STAT_META[study.stat].color;
  return (
    <SystemPanel title={study.title} sub={`${study.unit} ${study.phase} of ${study.phases}`}>
      <Text style={styles.phase}>{study.label}</Text>
      <Text style={styles.detail}>{study.detail}</Text>
      <StretchProgress study={study} hue={hue} />
      <StudyBody study={study} hue={hue} />
      {study.pending ? <PhaseReview label={study.label} hue={hue} /> : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  phase: { color: text.primary, fontSize: 15, fontWeight: '700' },
  detail: { color: text.secondary, fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 12 },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tallyLabel: { color: text.secondary, fontSize: 12 },
  tallyValue: { color: text.primary, fontSize: 12, fontWeight: '700' },
  meta: { color: text.faint, fontSize: 12, lineHeight: 17, marginTop: 8 },
  disclose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  discloseLabel: { color: text.secondary, fontSize: 13, fontWeight: '600' },
});
