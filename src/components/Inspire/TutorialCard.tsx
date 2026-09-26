import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { CardActions, cardStyles } from '@/components/Inspire/InsightCards';
import { CopyButton, StepList, longform } from '@/components/Inspire/Longform';
import { shared } from '@/components/Inspire/shared';
import { Text } from '@/components/ui/Text';
import type { ApiInsight } from '@/lib/api';
import { tutorialMeta, tutorialText } from '@/lib/tutorial';
import { accent, text } from '@/theme';

/** A captured tutorial: what it teaches (the header), its main points and the
 * steps in order — kept to hand on, so Copy puts the whole thing on the clipboard
 * as Markdown for another AI to pick up. No quotes, no to-dos: a walkthrough's
 * steps are the tutorial's, not a list of chores. */
export function TutorialCard({
  insight,
  expanded,
  onToggle,
  onRemove,
}: {
  insight: ApiInsight;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const empty = insight.takeaways.length === 0 && insight.steps.length === 0;

  return (
    <View style={shared.card}>
      <Pressable style={cardStyles.rowHead} onPress={onToggle} hitSlop={4}>
        <Ionicons name="school-outline" size={16} color={accent} />
        <View style={longform.head}>
          <Text style={cardStyles.rowSummary} numberOfLines={expanded ? undefined : 2}>
            {insight.title || insight.summary || 'Captured tutorial'}
          </Text>
          <Text style={longform.meta}>{tutorialMeta(insight)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.summary && insight.title ? <Text style={cardStyles.bulletText}>{insight.summary}</Text> : null}

          {empty ? <Text style={shared.empty}>Nothing came out of this one.</Text> : null}

          {insight.takeaways.length > 0 ? (
            <View style={cardStyles.takeaways}>
              <Text style={cardStyles.sectionLabel}>MAIN POINTS</Text>
              {insight.takeaways.map((t, i) => (
                <View key={i} style={cardStyles.bulletRow}>
                  <Text style={cardStyles.bulletDot}>•</Text>
                  <Text style={cardStyles.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <StepList label="STEPS" steps={insight.steps} />

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove}>
            {!empty ? <CopyButton body={() => tutorialText(insight)} title={insight.title} /> : null}
          </CardActions>
        </>
      ) : null}
    </View>
  );
}

