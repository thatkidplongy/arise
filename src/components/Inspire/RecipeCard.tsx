import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardActions, cardStyles } from '@/components/Inspire/InsightCards';
import { CopyButton, StepList, longform } from '@/components/Inspire/Longform';
import { shared } from '@/components/Inspire/shared';
import { Text } from '@/components/ui/Text';
import type { ApiInsight } from '@/lib/api';
import { groceryName, ingredientLine, onList, recipeMeta, recipeText } from '@/lib/recipe';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, font, press, radius, surface, text, typography } from '@/theme';

/** A captured recipe: the dish (the header), what goes in it and the method. Each
 * ingredient can go straight onto the Food tab's grocery list — named as the thing
 * you buy, with how much — and Copy hands the whole recipe on as Markdown. */
export function RecipeCard({
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
  const addGrocery = useSystem((s) => s.addGrocery);
  // Outside the selector for the reason GroceryPanel gives: a fresh [] from inside
  // one reads as a change on every render.
  const grocery = useSystem((s) => s.state?.grocery) ?? [];
  const toBuy = grocery.filter((g) => !g.bought).map((g) => g.name);
  const [added, setAdded] = useState<number[]>([]);

  const toGrocery = (i: number) => {
    if (added.includes(i)) return;
    setAdded((xs) => [...xs, i]);
    void addGrocery(groceryName(insight.ingredients[i]));
  };

  const empty = insight.ingredients.length === 0 && insight.steps.length === 0;

  return (
    <View style={shared.card}>
      <Pressable style={cardStyles.rowHead} onPress={onToggle} hitSlop={4}>
        <Ionicons name="restaurant-outline" size={16} color={accent} />
        <View style={longform.head}>
          <Text style={cardStyles.rowSummary} numberOfLines={expanded ? undefined : 2}>
            {insight.title || insight.summary || 'Captured recipe'}
          </Text>
          <Text style={longform.meta}>{recipeMeta(insight)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.summary && insight.title ? <Text style={cardStyles.bulletText}>{insight.summary}</Text> : null}

          {empty ? <Text style={shared.empty}>No recipe came out of this one.</Text> : null}

          {insight.ingredients.length > 0 ? (
            <View style={styles.list}>
              <Text style={cardStyles.sectionLabel}>INGREDIENTS</Text>
              {insight.ingredients.map((ing, i) => {
                const listed = added.includes(i) || onList(ing, toBuy);
                return (
                  <View key={i} style={styles.row}>
                    <Text style={styles.line}>
                      {ing.amount ? <Text style={styles.amount}>{ing.amount} </Text> : null}
                      {ing.item}
                    </Text>
                    <Pressable
                      onPress={() => toGrocery(i)}
                      disabled={listed}
                      hitSlop={6}
                      accessibilityLabel={listed ? 'On the grocery list' : `Add ${ingredientLine(ing)} to groceries`}
                      style={({ pressed }) => [styles.addBtn, pressed && { opacity: press.medium }]}
                    >
                      <Ionicons
                        name={listed ? 'checkmark-circle' : 'cart-outline'}
                        size={14}
                        color={listed ? feedback.success : accent}
                      />
                      <Text style={[styles.addText, listed && { color: feedback.success }]}>
                        {listed ? 'On list' : 'Grocery'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <StepList label="METHOD" steps={insight.steps} />

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove}>
            {!empty ? <CopyButton body={() => recipeText(insight)} title={insight.title} /> : null}
          </CardActions>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: surface.muted,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  line: { ...typography.body, flex: 1 },
  amount: { ...typography.body, fontFamily: font.bold },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { color: accent, fontSize: 12, fontWeight: '700' },
});
