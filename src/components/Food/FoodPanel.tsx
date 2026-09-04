import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DayNav } from '@/components/Food/DayNav';
import { DayRange } from '@/components/Food/DayRange';
import { EstimateArrived } from '@/components/Food/EstimateArrived';
import { EstimateInbox } from '@/components/Food/EstimateInbox';
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
import { draftFromHandoff, handoffFromUrl, type Handoff } from '@/lib/handoff';
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
import { space } from '@/theme';

/**
 * The Food screen: a day of plates, measured in hands — and priced as a range.
 *
 * Hands are still the unit you log in, because "was there a palm of protein on
 * that plate" is answerable at a restaurant table in two seconds where a gram
 * figure would be invented. What changed is that the day no longer hides what
 * those hands add up to: it shows a *span* against your band (see `DayRange`),
 * which claims exactly as much as portion-derived calories can support. A point
 * figure here would still be a lie; a range is not.
 *
 * The screen can also receive an estimate it didn't make — the Claude app's food
 * skill hands one over by deep link or paste. That path never writes anything
 * directly: it opens `EstimateArrived` for review, badged with where it came from,
 * and the plate lands only when you say so.
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

  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<PlateDraft | null>(null);
  const [logging, setLogging] = useState(false);
  // An estimate pasted in by hand, held for review. Kept beside the draft rather
  // than folded into it: the review screen shows what *arrived* even after you've
  // corrected the draft, so a corrected figure is never presented as though the
  // sender had proposed it.
  const [pasted, setPasted] = useState<Handoff | null>(null);

  // `arise://estimate?…` — what a share-sheet target sends, and what a tapped
  // link from the Claude app sends today. The hook gives the URL that opened the
  // app and every one after it, so the payload stays derived rather than copied
  // into state: the parse needs today's open slot, which isn't known until below.
  //
  // A link only ever *opens the review screen*. One that could log a plate
  // outright would let anything able to open a link write to the food log.
  const linkUrl = Linking.useLinkingURL();
  // A URL can't be un-sent, so dismissing one is remembered rather than cleared.
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);

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

  // A pasted estimate wins over a link: it is the more deliberate of the two, so
  // the URL the app was opened with can't shadow what you just pasted.
  const linked =
    linkUrl && linkUrl !== dismissedUrl ? handoffFromUrl(linkUrl, slot) : null;
  const handoff = pasted ?? linked;
  // The arriving estimate seeds the draft, and every edit after that is state.
  const review = draft ?? (handoff ? draftFromHandoff(handoff) : null);

  const submit = async () => {
    if (!review) return;
    setLogging(true);
    try {
      await logFood(draftToEntry(review, clockNow()));
      clear();
    } finally {
      setLogging(false);
    }
  };

  /** Put everything in flight back to nothing. Both the draft and whatever
   * proposed it, so a reviewed estimate can't reappear on the next render. */
  function clear() {
    setDraft(null);
    setPasted(null);
    if (linkUrl) setDismissedUrl(linkUrl);
  }

  return (
    <View style={styles.wrap}>
      <DayNav day={day} today={today} onChange={onDay} />
      <DayRange food={food} open={isToday && slot !== null} />
      <PlateCard plate={food.plate} targets={targets} week={week} />

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

      <EstimateInbox slot={slot} onReceive={setPasted} />

      <SystemPanel title="Packaged food" sub="the one thing with real numbers" collapsible defaultCollapsed>
        <PackagedSearch slot={slot} search={search} onPick={setDraft} />
      </SystemPanel>

      <Button label="Edit your body profile" tone="ghost" onPress={() => setEditingProfile(true)} block />

      {/* A handoff gets its own review screen; everything else goes straight to
          the sheet. Both end at the same `submit`, so an imported plate is logged
          by exactly the same path as one tapped out by hand. */}
      {handoff ? (
        <EstimateArrived
          key={`${handoff.source}:${handoff.kcal}:${handoff.name}`}
          handoff={handoff}
          draft={review}
          day={food}
          busy={logging}
          onChange={setDraft}
          onSubmit={submit}
          onClose={clear}
        />
      ) : (
        <LogPlateSheet
          draft={draft}
          busy={logging}
          onChange={setDraft}
          onSubmit={submit}
          onClose={clear}
        />
      )}
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
