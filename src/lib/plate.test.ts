import { describe, expect, it } from 'vitest';

import type { ApiFoodWeek, ApiPlate } from '@/lib/api';
import {
  bandConfidence,
  bandVerdict,
  clockLabel,
  clockNow,
  draftFromEstimate,
  draftFromUsual,
  draftToEntry,
  emptyDraft,
  isDraftLoggable,
  isPlate,
  mealTitle,
  openSlot,
  plateNudge,
  plateOf,
  portionDots,
  sayPortions,
  sayRange,
} from '@/lib/plate';

const plate = (p: Partial<ApiPlate> = {}): ApiPlate => ({ protein: 0, veg: 0, carb: 0, extra: 0, ...p });

describe('sayPortions', () => {
  it('spells small counts and names the unit', () => {
    expect(sayPortions(1, 'protein')).toBe('one palm');
    expect(sayPortions(2, 'veg')).toBe('two fists');
    expect(sayPortions(3, 'carb')).toBe('three cupped hands');
  });

  it('falls back to digits past the counting range', () => {
    expect(sayPortions(9, 'protein')).toBe('9 palms');
  });
});

describe('plateOf / isPlate', () => {
  it('reads the portions off an entry', () => {
    expect(plateOf({ protein_p: 1, veg_p: 2, carb_p: 0, extra_p: 0 })).toEqual(plate({ protein: 1, veg: 2 }));
  });

  it('knows a packaged food logged off its label is not a plate', () => {
    expect(isPlate(plate())).toBe(false);
    expect(isPlate(plate({ extra: 1 }))).toBe(true);
  });
});

describe('portionDots', () => {
  it('draws one dot per portion, in row order', () => {
    expect(portionDots(plate({ protein: 1, carb: 2 }))).toEqual(['protein', 'carb', 'carb']);
  });
});

describe('mealTitle', () => {
  it('leads with the slot and names the place', () => {
    expect(mealTitle({ slot: 'lunch', name: 'Adobo', place: "Aling Nena's" })).toBe("Lunch · Aling Nena's");
  });

  it('falls back to what it was when no slot was chosen', () => {
    expect(mealTitle({ slot: '', name: 'Iced latte', place: '' })).toBe('Iced latte');
    expect(mealTitle({ slot: '', name: '', place: '' })).toBe('A plate');
  });
});

describe('clockLabel', () => {
  it('compresses the clock to the timeline gutter', () => {
    expect(clockLabel('07:15')).toBe('7a');
    expect(clockLabel('12:15')).toBe('12p');
    expect(clockLabel('16:00')).toBe('4p');
    expect(clockLabel('00:30')).toBe('12a');
  });

  it('says nothing for a row logged before the clock was recorded', () => {
    expect(clockLabel('')).toBe('');
    expect(clockLabel('nonsense')).toBe('');
  });
});

describe('clockNow', () => {
  it('sends the phone wall-clock, zero-padded', () => {
    expect(clockNow(new Date(2026, 7, 26, 7, 5))).toBe('07:05');
  });
});

describe('openSlot', () => {
  it('offers the first meal the day is still waiting on', () => {
    expect(openSlot([])).toBe('breakfast');
    expect(openSlot([{ slot: 'breakfast' }])).toBe('lunch');
    expect(openSlot([{ slot: 'breakfast' }, { slot: 'lunch' }])).toBe('dinner');
  });

  it('drops to a snack once the three meals are in', () => {
    expect(openSlot([{ slot: 'breakfast' }, { slot: 'lunch' }, { slot: 'dinner' }])).toBe('snack');
  });
});

describe('plateNudge', () => {
  const targets = plate({ protein: 4, veg: 3, carb: 4, extra: 2 });

  it('asks for protein first, then vegetables', () => {
    expect(plateNudge(plate({ protein: 2, veg: 0 }), targets)).toBe('Two palms short of protein.');
    expect(plateNudge(plate({ protein: 4, veg: 1 }), targets)).toBe('Two fists short of vegetables.');
  });

  it('only mentions the ceilings once the day has what it asked for', () => {
    expect(plateNudge(plate({ protein: 4, veg: 3, carb: 6 }), targets)).toContain('starch mark');
    expect(plateNudge(plate({ protein: 4, veg: 3, extra: 3 }), targets)).toContain('Counted, not judged');
    expect(plateNudge(plate({ protein: 4, veg: 3, carb: 4, extra: 2 }), targets)).toContain('Everything today asked for');
  });

  it('sends you to the profile rather than inventing a target', () => {
    expect(plateNudge(plate({ protein: 1 }), null)).toContain('body profile');
  });
});

describe('sayRange', () => {
  it('groups the thousands on both ends', () => {
    expect(sayRange(1850, 2300)).toBe('1,850–2,300');
  });
});

describe('drafts', () => {
  it('starts a plate with nothing on it and nothing to log', () => {
    const draft = emptyDraft('lunch');
    expect(draft.plate).toEqual(plate());
    expect(isDraftLoggable(draft)).toBe(false);
  });

  it('brings a usual back with the portions you had there last time', () => {
    const draft = draftFromUsual(
      { name: 'Silog', count: 4, protein: 1, veg: 0, carb: 2, extra: 0 },
      'breakfast',
    );
    expect(draft.name).toBe('Silog');
    expect(draft.plate).toEqual(plate({ protein: 1, carb: 2 }));
    expect(isDraftLoggable(draft)).toBe(true);
  });

  it('takes a photo of a plate in hands, and a label in its printed numbers', () => {
    const meal = draftFromEstimate(
      { name: 'Adobo', protein_p: 1, veg_p: 0, carb_p: 2, extra_p: 0, kcal: 0, protein_g: 0, fibre_g: 0, note: 'a big serving', source: 'food' },
      'lunch',
    );
    expect(meal.plate).toEqual(plate({ protein: 1, carb: 2 }));
    expect(meal.note).toBe('a big serving');

    const label = draftFromEstimate(
      { name: 'Protein bar', protein_p: 0, veg_p: 0, carb_p: 0, extra_p: 0, kcal: 220, protein_g: 20, fibre_g: 3, note: '', source: 'label' },
      'snack',
    );
    expect(label.plate).toEqual(plate());
    expect(label.kcal).toBe(220);
    expect(isDraftLoggable(label)).toBe(true); // real numbers are still worth logging
  });

  it('sends the slot as the name when the plate was never named', () => {
    const entry = draftToEntry({ ...emptyDraft('dinner'), plate: plate({ protein: 1 }) }, '19:30');
    expect(entry.name).toBe('Dinner');
    expect(entry.protein_p).toBe(1);
    expect(entry.at_time).toBe('19:30');
  });
});

describe('the week against the band', () => {
  const week = (over: Partial<ApiFoodWeek> = {}): ApiFoodWeek => ({
    days: [],
    logged_days: 5,
    in_band_days: 3,
    band_low: 2100,
    band_high: 2300,
    kcal_low: 2050,
    kcal_high: 2400,
    protein_low: 90,
    protein_high: 130,
    fibre_low: 14,
    fibre_high: 24,
    ...over,
  });

  it('says probably, because portions can only support probably', () => {
    expect(bandVerdict(week())).toBe('Probably inside your band');
    expect(bandVerdict(week({ kcal_low: 2500, kcal_high: 2900 }))).toBe('Probably above your band');
    expect(bandVerdict(week({ kcal_low: 1500, kcal_high: 1900 }))).toBe('Probably under your band');
  });

  it('claims nothing without days logged or a profile to compare against', () => {
    expect(bandVerdict(week({ logged_days: 0 }))).toContain('Nothing logged');
    expect(bandVerdict(week({ band_low: 0, band_high: 0 }))).toContain('set a profile');
  });

  it('refuses to call three days a trend', () => {
    expect(bandConfidence(week({ logged_days: 3 }))).toContain('too few to read as a trend');
    expect(bandConfidence(week())).toBe('Five of the last seven days logged, three of them landing across your band.');
  });
});
