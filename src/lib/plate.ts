/**
 * The hand-portion vocabulary the Food screen speaks, and the pure helpers that
 * turn a day of plates into the one line worth reading.
 *
 * The unit is the hand because most meals here are bought and a bought plate
 * can't be weighed — "was there a palm of protein on that plate" is answerable at
 * a restaurant table in two seconds, where a gram figure would be invented. The
 * portion targets themselves are the backend's (nutrition.plate_targets), derived
 * from the same body profile the calorie band comes from; nothing here recomputes
 * them.
 */

import type {
  ApiFoodEntry,
  ApiFoodEstimate,
  ApiFoodWeek,
  ApiPlate,
  ApiUsual,
  FoodEntry,
  MealSlot,
} from '@/lib/api';

export type PortionKey = keyof ApiPlate;

/** The four rows, in the order they're read. */
export const PORTION_ORDER: PortionKey[] = ['protein', 'veg', 'carb', 'extra'];

interface PortionMeta {
  label: string;
  /** The measure, said the way you'd say it at a table. */
  measure: string;
  /** How the target reads under the label. */
  aim: (target: number) => string;
  /** A mark you'd rather stay under, vs. a target you climb toward. The screen
   * colours the two differently — sage for what the day is asking for, clay for
   * what it is only counting — but the colour itself belongs to the theme. */
  ceiling: boolean;
}

export const PORTION: Record<PortionKey, PortionMeta> = {
  protein: {
    label: 'Protein',
    measure: 'a palm',
    aim: (n) => `a palm per meal · aim for ${n}`,
    ceiling: false,
  },
  veg: {
    label: 'Vegetables',
    measure: 'a fist',
    aim: (n) => `a fist per meal · aim for ${n}`,
    ceiling: false,
  },
  carb: {
    label: 'Rice & starch',
    measure: 'a cupped hand',
    aim: (n) => `a cupped hand · ${n} is plenty`,
    ceiling: true,
  },
  extra: {
    label: 'Sweet drinks & fried',
    measure: 'one of them',
    aim: () => 'counted, not banned',
    ceiling: true,
  },
};

const ONE: Record<PortionKey, string> = {
  protein: 'palm',
  veg: 'fist',
  carb: 'cupped hand',
  extra: 'extra',
};
const MANY: Record<PortionKey, string> = {
  protein: 'palms',
  veg: 'fists',
  carb: 'cupped hands',
  extra: 'extras',
};

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

/** 'two palms' — spelled out while the count is still small enough to picture. */
export function sayPortions(n: number, unit: PortionKey): string {
  const word = n < WORDS.length ? WORDS[n] : String(n);
  return `${word} ${n === 1 ? ONE[unit] : MANY[unit]}`;
}

export const EMPTY_PLATE: ApiPlate = { protein: 0, veg: 0, carb: 0, extra: 0 };

/** The portions on one logged entry, as a plate. */
export function plateOf(entry: {
  protein_p: number;
  veg_p: number;
  carb_p: number;
  extra_p: number;
}): ApiPlate {
  return {
    protein: entry.protein_p,
    veg: entry.veg_p,
    carb: entry.carb_p,
    extra: entry.extra_p,
  };
}

/** Whether anything on this entry was measured in hands at all. A packaged food
 * logged off its label has none, and shows its own numbers instead. */
export function isPlate(plate: ApiPlate): boolean {
  return PORTION_ORDER.some((key) => plate[key] > 0);
}

/** Every portion on a plate, flattened into one dot per portion — what the
 * timeline draws beside a meal. */
export function portionDots(plate: ApiPlate): PortionKey[] {
  return PORTION_ORDER.flatMap((key) => Array.from({ length: plate[key] }, () => key));
}

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** The order a day is eaten in — how the "what's still open" question is answered. */
export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** 'Lunch · Aling Nena's' — the slot leads, because that's what you're looking for
 * when you scan the day. A plate with no slot is named by what it was. */
export function mealTitle(entry: Pick<ApiFoodEntry, 'slot' | 'name' | 'place'>): string {
  const head = entry.slot ? SLOT_LABEL[entry.slot] : entry.name.trim() || 'A plate';
  return entry.place.trim() ? `${head} · ${entry.place.trim()}` : head;
}

/** '7a', '12p', '4p' — the timeline's left gutter. '' when the row predates the
 * clock being recorded, and the row simply sits in log order instead. */
export function clockLabel(atTime: string): string {
  const [h, m] = atTime.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23) return '';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${h < 12 ? 'a' : 'p'}`;
}

/** 'HH:MM' on the phone's own clock — sent with a plate so it can be read back as
 * the time you ate rather than the UTC instant it was stored at. */
export function clockNow(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** The meal the day is still waiting on: the first of breakfast / lunch / dinner
 * not yet logged, or a snack once all three are in. */
export function openSlot(entries: Pick<ApiFoodEntry, 'slot'>[]): MealSlot {
  const logged = new Set(entries.map((e) => e.slot));
  return SLOTS.find((slot) => slot !== 'snack' && !logged.has(slot)) ?? 'snack';
}

export function slotLabel(slot: MealSlot): string {
  return SLOT_LABEL[slot];
}

/**
 * The one line under the day's plates: what it's still short of, or what it has
 * already run past.
 *
 * Protein leads, then vegetables — those are what the day is asking for. Only once
 * both are met does the starch ceiling get a word, and even then it's a remark
 * rather than a verdict: a food log that scores you is one people quit.
 */
export function plateNudge(plate: ApiPlate, targets: ApiPlate | null): string {
  if (!targets) return 'Set your body profile and these get sized to you.';
  for (const key of ['protein', 'veg'] as const) {
    const short = targets[key] - plate[key];
    if (short > 0) {
      return `${capitalise(sayPortions(short, key))} short of ${PORTION[key].label.toLowerCase()}.`;
    }
  }
  if (plate.carb > targets.carb) return 'Past the starch mark — nothing to undo, just worth knowing.';
  if (plate.extra > targets.extra) {
    return `${capitalise(sayPortions(plate.extra, 'extra'))} today. Counted, not judged.`;
  }
  return 'Everything today asked for. Anything more is yours.';
}

/** '1,850–2,300' — a range, spelled the way the trend screen says it. */
export function sayRange(low: number, high: number): string {
  return `${low.toLocaleString()}–${high.toLocaleString()}`;
}

/**
 * A plate being built, before anything is logged.
 *
 * Everything arrives here editable, whatever proposed it — a photo, a database
 * lookup, one of your usuals. Nothing an estimate produced goes into the day
 * behind your back; the guess is a starting point you correct with your own hand.
 */
export interface PlateDraft {
  slot: MealSlot;
  name: string;
  place: string;
  plate: ApiPlate;
  /** Only set when the food genuinely came with numbers — a packaged label, a
   * database lookup. Zero on a plate measured in hands, which is the normal case. */
  grams: number;
  kcal: number;
  protein_g: number;
  fibre_g: number;
  /** Where the draft came from, in one line — "Best guess from the photo". */
  note: string;
}

export function emptyDraft(slot: MealSlot): PlateDraft {
  return { slot, name: '', place: '', plate: { ...EMPTY_PLATE }, grams: 0, kcal: 0, protein_g: 0, fibre_g: 0, note: '' };
}

/** One of your usuals, ready to log again — the portions you had there last time. */
export function draftFromUsual(usual: ApiUsual, slot: MealSlot): PlateDraft {
  return {
    ...emptyDraft(slot),
    name: usual.name,
    plate: { protein: usual.protein, veg: usual.veg, carb: usual.carb, extra: usual.extra },
  };
}

/** A photo's read of the plate. A meal comes back in hands; a nutrition label
 * comes back in the numbers it printed, and those are kept as printed. */
export function draftFromEstimate(estimate: ApiFoodEstimate, slot: MealSlot): PlateDraft {
  return {
    ...emptyDraft(slot),
    name: estimate.name,
    plate: {
      protein: estimate.protein_p,
      veg: estimate.veg_p,
      carb: estimate.carb_p,
      extra: estimate.extra_p,
    },
    kcal: estimate.kcal,
    protein_g: estimate.protein_g,
    fibre_g: estimate.fibre_g,
    note: estimate.note,
  };
}

/** Nothing measured, nothing counted — there's no plate here to log yet. */
export function isDraftLoggable(draft: PlateDraft): boolean {
  return isPlate(draft.plate) || draft.kcal > 0;
}

/** The draft as the API takes it. `at` is the phone's own clock, so the timeline
 * can read the row back as the time you ate. */
export function draftToEntry(draft: PlateDraft, at: string): FoodEntry {
  return {
    name: draft.name.trim() || slotLabel(draft.slot),
    slot: draft.slot,
    place: draft.place.trim(),
    at_time: at,
    protein_p: draft.plate.protein,
    veg_p: draft.plate.veg,
    carb_p: draft.plate.carb,
    extra_p: draft.plate.extra,
    grams: draft.grams,
    kcal: draft.kcal,
    protein_g: draft.protein_g,
    fibre_g: draft.fibre_g,
  };
}

/**
 * Where the week's estimate sits against the band, said as a probability rather
 * than a verdict.
 *
 * "Probably" is doing real work: this is portions turned into calories, and the
 * honest error on a week of bought food is wide enough that a flat "you were over"
 * would be a claim the data can't support.
 */
export function bandVerdict(week: ApiFoodWeek): string {
  if (!week.logged_days) return 'Nothing logged yet this week';
  if (!week.band_high) return 'Your week, once you set a profile';
  if (week.kcal_low > week.band_high) return 'Probably above your band';
  if (week.kcal_high < week.band_low) return 'Probably under your band';
  return 'Probably inside your band';
}

/** How much the week's range is worth trusting, and what would tighten it. */
export function bandConfidence(week: ApiFoodWeek): string {
  if (!week.logged_days) return 'Log a few plates and this starts meaning something.';
  const days = `${sayCount(week.logged_days)} of the last seven days logged`;
  if (week.logged_days < 4) return `${capitalise(days)} — too few to read as a trend yet.`;
  return `${capitalise(days)}, ${sayCount(week.in_band_days)} of them landing across your band.`;
}

const COUNTS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

function sayCount(n: number): string {
  return n < COUNTS.length ? COUNTS[n] : String(n);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
