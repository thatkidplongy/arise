/**
 * The Body tab's own world: nutrition targets, the food log, and skincare.
 *
 * Separate from the core game types because it genuinely is — it hangs off its
 * own endpoint (/body/state, not /state), it feeds no attribute except through
 * the skincare routine, and nothing in here refers to a quest, a stat or the
 * player. The file it came out of already had it fenced off under a heading
 * saying "standalone wellness tools"; this makes that structural.
 */

// ── Body (standalone wellness tools) ─────────────────────────────────────────

export interface ApiBodyProfile {
  sex: string; // male | female | unspecified
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: string; // sedentary | light | moderate | active | very_active
  goal: string; // maintain | gentle_loss | gentle_gain (fallback when no goal weight)
  goal_weight_kg: number; // 0 = not set
  country: string; // "" = worldwide; "PH" = localised food picks
}

export interface ApiTargets {
  bmr: number;
  tdee: number;
  target: number;
  target_low: number;
  target_high: number;
  protein_g: number;
  fibre_g: number;
  bmi: number;
  bmi_category: string; // underweight | healthy | overweight | obese
  healthy_low: number;
  healthy_high: number;
  goal_weight: number; // 0 when not set
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** A plate in hand portions — the unit the Food screen logs and tallies in. */
export interface ApiPlate {
  protein: number; // palms
  veg: number; // fists
  carb: number; // cupped hands
  extra: number; // sweet drinks & fried
}

export interface ApiFoodEntry {
  id: string;
  name: string;
  slot: MealSlot | '';
  place: string; // where it was eaten; '' = unsaid
  at_time: string; // 'HH:MM' on the hunter's own clock; '' on rows logged before plates
  protein_p: number;
  veg_p: number;
  carb_p: number;
  extra_p: number;
  // Only filled in for a food that genuinely came with numbers — a packaged
  // label, a database lookup. Zero on a plate logged in hands, which is the norm.
  grams: number;
  kcal: number;
  protein_g: number;
  fibre_g: number;
  /** Where the figures came from: 'claude' (handed over from the Claude app),
   * 'photo' (read in app), 'label' (off a nutrition panel), '' (hand-counted).
   * The timeline badges the row from this, so an estimate never reads as a
   * measurement. */
  source: EntrySource;
  /** This row's own honest range, from the same portion table the week uses —
   * wide on a plate of hands, tight on a label read. */
  kcal_low: number;
  kcal_high: number;
}

/** Where a plate's figures came from. '' is hand-counted: an absent claim of
 * provenance rather than a claim of having been measured. */
export type EntrySource = 'claude' | 'photo' | 'label' | '';

/** The fields sent when logging a plate — an entry without its server id, and
 * without the range the server derives for itself. */
export type FoodEntry = Omit<ApiFoodEntry, 'id' | 'kcal_low' | 'kcal_high'>;

export interface ApiFoodDay {
  entries: ApiFoodEntry[];
  plate: ApiPlate; // what the day's plates added up to, in hands
  total_kcal: number;
  total_protein: number;
  total_fibre: number;
  // The day as a range against the band, never a point figure — the same
  // estimate the week is built from, so the two cannot disagree.
  kcal_low: number;
  kcal_high: number;
  in_band: boolean; // the day's range overlaps the band
  band_low: number; // 0 until the profile has real numbers
  band_high: number;
}

/** A plate logged before — one tap to log it again. */
export interface ApiUsual extends ApiPlate {
  name: string;
  count: number;
}

export interface ApiFoodWeekDay extends ApiPlate {
  day: string;
  logged: number; // plates logged that day
  kcal_low: number;
  kcal_high: number;
  in_band: boolean; // the day's range overlaps the target band
}

/** The rolling seven days as a calorie range against the band — the widest lens
 * on the same estimate the day shows, and the one where the error averages out. */
export interface ApiFoodWeek {
  days: ApiFoodWeekDay[];
  logged_days: number;
  in_band_days: number;
  band_low: number; // 0 until the profile has real numbers
  band_high: number;
  kcal_low: number; // per logged day
  kcal_high: number;
  protein_low: number;
  protein_high: number;
  fibre_low: number;
  fibre_high: number;
}

export interface ApiFoodSearchItem {
  name: string;
  brand: string;
  kcal_100g: number;
  protein_100g: number;
  fibre_100g: number;
  serving_size: string;
}

export interface ApiSuggestion {
  name: string;
  serving: string;
  kcal: number;
  protein_g: number;
  fibre_g: number;
  tag: 'protein' | 'fibre' | 'meal';
}

/** An AI estimate from a food photo — the user edits it before logging. A plated
 * meal comes back in hand portions; a packaged label in the numbers it printed. */
export interface ApiFoodEstimate {
  name: string;
  protein_p: number;
  veg_p: number;
  carb_p: number;
  extra_p: number;
  kcal: number;
  protein_g: number;
  fibre_g: number;
  note: string;
  source: string; // 'label' (read off a nutrition panel), 'food', 'none', or ''
}

export interface ApiSkincareStep {
  id: string;
  routine: 'AM' | 'PM';
  text: string;
  done: boolean;
}

export interface ApiSkincareNote {
  label: string; // e.g. "Niacinamide" / "Fragrance"
  detail: string; // one gentle line on why it's flagged
}

/** A concrete product to buy for a routine step, localised to what's on shelves. */
export interface ApiSkincarePick {
  slot: 'AM' | 'PM';
  step: string;
  brand: string;
  product: string;
  why: string;
}

/** A product looked up in Open Beauty Facts, with a read of its ingredients. */
export interface ApiSkincareProduct {
  name: string;
  brand: string;
  ingredients: string; // raw INCI list (truncated), for the curious
  helpful: ApiSkincareNote[]; // actives that help pigmentation & pores
  watch: ApiSkincareNote[]; // worth knowing if your skin runs sensitive
}

export interface ApiBody {
  day: string;
  profile: ApiBodyProfile | null;
  targets: ApiTargets | null;
  plate_targets: ApiPlate | null; // the same targets in hands; null without a profile
  food: ApiFoodDay;
  usuals: ApiUsual[]; // plates logged before, most-repeated first
  week: ApiFoodWeek; // the rolling seven days, for the trend screen
  suggestions: ApiSuggestion[];
  skincare_am: ApiSkincareStep[];
  skincare_pm: ApiSkincareStep[];
  skincare_products: ApiSkincarePick[];
  skincare_resources: string[];
  skincare_note: string;
  skincare_streak: number; // consecutive days a routine block was completed
  skincare_days: number; // total days you've done your routine
}

