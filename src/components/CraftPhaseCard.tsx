import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import type { ApiCraft } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { STAT_META, feedback, onAccent, surface, text, withAlpha } from '@/theme';

/** Craft's colour — this is the coding/architecture attribute. */
const HUE = STAT_META.CFT.color;

/**
 * The phase check-in: "have you read this phase's material?"
 *
 * Shown only once the pages you've logged cover the phase, and at most once a week.
 * Yes moves you on, not yet holds — no penalty either way, and nothing expires.
 */
function PhaseReview({ label }: { label: string }) {
  const reviewCraftPhase = useSystem((s) => s.reviewCraftPhase);

  return (
    <View style={styles.review}>
      <Text style={styles.reviewBody}>
        You’ve logged enough to cover {label}. Ready for the next phase?
      </Text>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.85 }]}
          onPress={() => void reviewCraftPhase(true)}
        >
          <Text style={styles.primaryText}>Yes, move on</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
          onPress={() => void reviewCraftPhase(false)}
        >
          <Text style={styles.btnText}>Not yet</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PhaseProgress({ craft }: { craft: ApiCraft }) {
  const covered = craft.studied >= craft.pieces;
  return (
    <>
      <View style={styles.tallyRow}>
        <Text style={styles.tallyLabel}>Studied from Notion</Text>
        <Text style={styles.tallyValue}>
          {craft.studied} / {craft.pieces}
        </Text>
      </View>
      <XpBar
        value={Math.min(craft.studied, craft.pieces)}
        max={craft.pieces}
        color={covered ? feedback.success : HUE}
        height={8}
      />
      <Text style={styles.meta}>
        {craft.is_last
          ? 'The last phase — design reps carry on for as long as you want them to.'
          : 'This phase holds until you say it’s read. Nothing here is on a clock.'}
      </Text>
    </>
  );
}

/**
 * Where you are in the system-design plan — the Craft equivalent of the reading
 * panel. Progress is the Notion pages you've logged, not weeks elapsed: a plan that
 * advanced by date would march you past material you hadn't opened.
 */
export function CraftPhaseCard() {
  const craft = useSystem((s) => s.state?.craft);
  if (!craft) return null;

  return (
    <SystemPanel title="System design" sub={`Phase ${craft.phase} of ${craft.phases}`}>
      <Text style={styles.phase}>{craft.label}</Text>
      <Text style={styles.detail}>{craft.detail}</Text>
      <PhaseProgress craft={craft} />
      {craft.pending ? <PhaseReview label={craft.label} /> : null}
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
  review: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: withAlpha(HUE, 0.4),
    backgroundColor: withAlpha(HUE, 0.06),
    borderRadius: 11,
    padding: 13,
    gap: 10,
  },
  reviewBody: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  btnText: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  primary: { backgroundColor: HUE, borderColor: HUE },
  primaryText: { color: onAccent, fontSize: 13, fontWeight: '700' },
});
