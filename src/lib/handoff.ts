/**
 * An estimate handed over from somewhere else — today, the Claude app's
 * food-photo skill.
 *
 * Arise's job here is to *receive a figure it did not produce*, which is a
 * different problem from reading a photo itself. The screen that renders this
 * (see `EstimateArrived`) has to say where the number came from and how wide it
 * is, and let it be corrected before anything lands. So the parse below is
 * deliberately strict and total: every field is validated, anything unrecognised
 * is dropped rather than coerced, and a payload that carries no plate and no
 * calories is rejected outright. A handoff that arrives half-understood would put
 * an invented number in the day under the authority of a real one.
 *
 * The wire format is the contract the skill emits, in a fixed field order:
 * point estimate, low/high, protein, fibre, slot guess, name, place, and the four
 * hand counts. Two transports carry it:
 *
 *   arise://estimate?kcal=1170&low=900&high=1450&protein=70&fibre=8
 *           &slot=lunch&name=Miso%20ramen&place=&p=2&v=1&c=2&e=1
 *
 * and the same fields as JSON, for paste. The deep link is what a share-sheet
 * target would use; paste is the fallback that works today with no native build.
 */

import type { EntrySource, MealSlot } from '@/lib/api';
import { EMPTY_PLATE, MAX_PER_PLATE, SLOTS, type PlateDraft } from '@/lib/plate';

/** An estimate as it arrives, before it becomes an editable draft. */
export interface Handoff {
  /** The point estimate and the honest span around it. `low`/`high` are 0 when
   * the source gave a bare figure — a label read, where a range would be noise. */
  kcal: number;
  low: number;
  high: number;
  protein_g: number;
  fibre_g: number;
  /** What the sender guessed the meal was. Always shown as a guess, never
   * applied silently. */
  slot: MealSlot;
  name: string;
  place: string;
  plate: { protein: number; veg: number; carb: number; extra: number };
  /** 'label' when read off a nutrition panel — exact, so it narrows the day
   * instead of widening it. 'claude' for a plate estimated from a photo. */
  source: EntrySource;
  /** Label reads only: the panel's own serving size in grams, and how many of
   * them were eaten. A panel states its numbers *per serving*, so these are what
   * make "how much did you eat?" answerable without re-reading the photo — the
   * figures above are one serving's worth and scale by `servings`. 0 and 1 when
   * the panel gave no serving size, which is the case where grams stay unknown
   * and the figures are taken as the whole of what was eaten. */
  serving_g: number;
  servings: number;
  /** Label reads only: servings in the whole pack, when the panel printed it.
   * 0 when it didn't — and then "whole pack" is not offered rather than guessed,
   * because a pack size invented here would scale every figure above it. */
  pack_servings: number;
}

/** Portion counts are integers the app's own steppers could have produced, so a
 * handoff can never write a plate you couldn't have tapped yourself. */
function portion(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_PER_PLATE, n));
}

/** A non-negative figure, or 0. Rounded: a calorie estimate with a decimal place
 * claims a precision no photo has. */
function figure(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function trimmed(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function slotOf(raw: unknown, fallback: MealSlot): MealSlot {
  const named = trimmed(raw, 20).toLowerCase();
  return (SLOTS as readonly string[]).includes(named) ? (named as MealSlot) : fallback;
}

/** 'label' is the only source a handoff may claim beyond 'claude': it means the
 * numbers were printed rather than guessed, which is the one case the screen
 * presents as exact. Anything else becomes 'claude' — an unrecognised claim of
 * provenance is treated as the weaker one, never the stronger. */
function sourceOf(raw: unknown): EntrySource {
  return trimmed(raw, 20).toLowerCase() === 'label' ? 'label' : 'claude';
}

/**
 * Read a handoff out of a bag of loose fields — query params or parsed JSON.
 *
 * Returns null when there is nothing worth reviewing: no portions and no
 * calories means no plate, and a review screen for an empty estimate is worse
 * than no screen at all.
 */
export function readHandoff(raw: Record<string, unknown>, fallbackSlot: MealSlot): Handoff | null {
  const plate = {
    protein: portion(raw.p ?? raw.protein_p),
    veg: portion(raw.v ?? raw.veg_p),
    carb: portion(raw.c ?? raw.carb_p),
    extra: portion(raw.e ?? raw.extra_p),
  };
  const kcal = figure(raw.kcal);
  const anyPortion = plate.protein || plate.veg || plate.carb || plate.extra;
  if (!anyPortion && !kcal) return null;

  const low = figure(raw.low ?? raw.kcal_low);
  const high = figure(raw.high ?? raw.kcal_high);
  return {
    kcal,
    // A span that doesn't contain its own point estimate is a broken payload,
    // not a narrow one — drop both ends rather than draw a bar that lies.
    low: low && high && low <= high && (!kcal || (low <= kcal && kcal <= high)) ? low : 0,
    high: low && high && low <= high && (!kcal || (low <= kcal && kcal <= high)) ? high : 0,
    protein_g: figure(raw.protein ?? raw.protein_g),
    fibre_g: figure(raw.fibre ?? raw.fibre_g),
    slot: slotOf(raw.slot, fallbackSlot),
    name: trimmed(raw.name, 80),
    place: trimmed(raw.place, 60),
    plate,
    source: sourceOf(raw.source),
    serving_g: figure(raw.serving_g ?? raw.grams),
    // At least one: a payload claiming zero servings describes nothing eaten.
    servings: Math.max(1, portion(raw.servings) || 1),
    pack_servings: portion(raw.pack_servings),
  };
}

/** The `arise://estimate?…` form, as a share target or a tapped link would send
 * it. Anything that isn't that route is not ours to read. */
export function handoffFromUrl(url: string, fallbackSlot: MealSlot): Handoff | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const route = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  if (!/(^|\/)estimate$/.test(route)) return null;
  const fields: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    fields[key] = value;
  });
  return readHandoff(fields, fallbackSlot);
}

/** The pasted form — the skill's card copied whole. Accepts the JSON block; a
 * paste that isn't a JSON object is simply not a handoff. */
export function handoffFromText(pasted: string, fallbackSlot: MealSlot): Handoff | null {
  const text = pasted.trim();
  if (!text) return null;
  if (text.startsWith('arise://') || text.startsWith('http')) {
    return handoffFromUrl(text, fallbackSlot);
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return readHandoff(parsed as Record<string, unknown>, fallbackSlot);
}

/**
 * A handoff as an editable draft — the same shape the sheet and the photo read
 * already produce, so an imported estimate goes through exactly the same
 * correct-then-log path as anything else.
 *
 * A label read keeps its printed numbers *and* no portions: portions would
 * override them (the weekly estimate is built from the portion table whenever a
 * portion is above zero), which would throw away the most accurate input the app
 * ever gets.
 */
export function draftFromHandoff(handoff: Handoff, servings = handoff.servings): PlateDraft {
  const label = handoff.source === 'label';
  // Only a label scales: its figures are per serving by definition. A photo
  // estimate is already the whole plate, and multiplying a guess would compound
  // the error rather than describe more food.
  const n = label ? Math.max(1, servings) : 1;
  return {
    slot: handoff.slot,
    name: handoff.name,
    place: handoff.place,
    plate: label ? { ...EMPTY_PLATE } : { ...handoff.plate },
    // Grams are what earn a label its tight spread on the weekly estimate, so
    // they are passed on whenever the panel stated a serving size.
    grams: label ? handoff.serving_g * n : 0,
    kcal: handoff.kcal * n,
    protein_g: handoff.protein_g * n,
    fibre_g: handoff.fibre_g * n,
    note: '',
    source: handoff.source,
  };
}

/** The span to show under the headline figure, or '' when the source gave a bare
 * number and inventing a spread for it would be dishonest. */
export function sayHandoffRange(handoff: Handoff): string {
  if (!handoff.low || !handoff.high) return '';
  return `range ${handoff.low.toLocaleString()}–${handoff.high.toLocaleString()}`;
}
