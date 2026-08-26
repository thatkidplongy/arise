import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DayNav } from '@/components/Food/DayNav';
import { FuelQuestCard } from '@/components/Food/FuelQuestCard';
import { LogPlateSheet } from '@/components/Food/LogPlateSheet';
import { MealTimeline } from '@/components/Food/MealTimeline';
import { PackagedSearch } from '@/components/Food/PackagedSearch';
import { PhotoPlate } from '@/components/Food/PhotoPlate';
import { PlateCard } from '@/components/Food/PlateCard';
import { UsualsRow } from '@/components/Food/UsualsRow';
import { NutritionProfileForm } from '@/components/NutritionProfileForm';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import type { ApiPlate, ApiUsual } from '@/lib/api';
import {
  PORTION,
  clockNow,
  draftFromUsual,
  draftToEntry,
  emptyDraft,
  openSlot,
  sayPortions,
  type PlateDraft,
} from '@/lib/plate';
import { useBody } from '@/query/useBody';
import { useSystem } from '@/store/useSystem';
import { space } from '@/theme';

/**
 * The Food screen: a day of plates, measured in hands.
 *
 * The one thing this screen never shows is a calorie count. On bought food that
 * figure would be invented three times a day, and inventing numbers is what makes
 * people quit a food log; every question here — was there a palm of protein on
 * that plate — is answerable at a table in two seconds. The calorie band still
 * exists, and still matters: it moved to the week (see the trend screen), where
 * the estimate error averages out.
 */
export function FoodPanel({
  day,
  today,
  onDay,
}: {
  day: string;
  today: string;
  onDay: (next: string) => void;
}) {
  const { body, logFood, removeFood, search, analyzePhoto } = useBody(day);
  const fuelQuest = useSystem((s) => s.state?.quests.find((q) => q.id === 'd-fuel')) ?? null;

  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<PlateDraft | null>(null);
  const [logging, setLogging] = useState(false);

  if (!body) return null;

  // The profile is this tab's one setup step: without it the portions have no
  // sizes, so the form comes first rather than a screen full of empty targets.
  if (editingProfile || !body.profile) {
    return (
      <SystemPanel title="Nourishment" sub="Set your gentle targets">
        <NutritionProfileForm profile={body.profile} onDone={() => setEditingProfile(false)} />
      </SystemPanel>
    );
  }

  const { food, usuals, week } = body;
  const targets = body.plate_targets;
  const isToday = day === today;
  const slot = openSlot(food.entries);

  const submit = async () => {
    if (!draft) return;
    setLogging(true);
    try {
      await logFood(draftToEntry(draft, clockNow()));
      setDraft(null);
    } finally {
      setLogging(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <DayNav day={day} today={today} onChange={onDay} />
      <PlateCard plate={food.plate} targets={targets} week={week} />
      {isToday && fuelQuest ? <FuelQuestCard quest={fuelQuest} /> : null}

      <MealTimeline
        entries={food.entries}
        openSlot={isToday ? slot : null}
        invitation={invitation(food.plate, targets)}
        onAdd={(next) => setDraft(emptyDraft(next))}
        onRemove={(id) => void removeFood(id)}
      />

      <UsualsRow usuals={usuals} onPick={(usual: ApiUsual) => setDraft(draftFromUsual(usual, slot))} />

      <Button label="Log a plate" onPress={() => setDraft(emptyDraft(slot))} block large />
      <PhotoPlate slot={slot} analyze={analyzePhoto} onRead={setDraft} />

      <SystemPanel title="Packaged food" sub="the one thing with real numbers" collapsible defaultCollapsed>
        <PackagedSearch slot={slot} search={search} onPick={setDraft} />
      </SystemPanel>

      <Button label="Edit your body profile" tone="ghost" onPress={() => setEditingProfile(true)} block />

      <LogPlateSheet
        draft={draft}
        busy={logging}
        onChange={setDraft}
        onSubmit={submit}
        onClose={() => setDraft(null)}
      />
    </View>
  );
}

/** The line on the open meal — what this plate could still close out. Named as a
 * portion rather than a verdict: the day is being helped, not marked. */
function invitation(plate: ApiPlate, targets: ApiPlate | null): string {
  if (!targets) return 'Log what was on it, in palms and fists';
  const shortProtein = targets.protein - plate.protein;
  const shortVeg = targets.veg - plate.veg;
  if (shortProtein > 0 && shortVeg > 0) return 'A palm of protein and a fist of veg closes today';
  if (shortProtein > 0) return `${capitalise(sayPortions(shortProtein, 'protein'))} of protein closes today`;
  if (shortVeg > 0) return `${capitalise(sayPortions(shortVeg, 'veg'))} of ${PORTION.veg.label.toLowerCase()} closes today`;
  return 'Today is already there — eat what you like';
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
});
