import { describe, expect, it } from 'vitest';

import {
  draftFromHandoff,
  handoffFromText,
  handoffFromUrl,
  readHandoff,
  sayHandoffRange,
} from '@/lib/handoff';

/** The miso ramen card, as the skill emits it. */
const RAMEN = {
  kcal: 1170,
  low: 900,
  high: 1450,
  protein: 70,
  fibre: 8,
  slot: 'lunch',
  name: 'Miso ramen with crispy pork',
  place: '',
  p: 2,
  v: 1,
  c: 2,
  e: 1,
};

describe('readHandoff', () => {
  it('reads the contract the skill emits', () => {
    const h = readHandoff(RAMEN, 'dinner');
    expect(h).not.toBeNull();
    expect(h!.kcal).toBe(1170);
    expect(h!.low).toBe(900);
    expect(h!.high).toBe(1450);
    expect(h!.protein_g).toBe(70);
    expect(h!.fibre_g).toBe(8);
    expect(h!.slot).toBe('lunch');
    expect(h!.name).toBe('Miso ramen with crispy pork');
    expect(h!.plate).toEqual({ protein: 2, veg: 1, carb: 2, extra: 1 });
    expect(h!.source).toBe('claude');
  });

  it('accepts the long field names as well as the short ones', () => {
    const h = readHandoff(
      { protein_p: 2, veg_p: 1, carb_p: 2, extra_p: 0, kcal_low: 700, kcal_high: 900, kcal: 800 },
      'lunch',
    );
    expect(h!.plate).toEqual({ protein: 2, veg: 1, carb: 2, extra: 0 });
    expect(h!.low).toBe(700);
    expect(h!.high).toBe(900);
  });

  it('rejects a payload with no plate and no calories', () => {
    expect(readHandoff({ name: 'Lunch', place: 'work' }, 'lunch')).toBeNull();
    expect(readHandoff({}, 'lunch')).toBeNull();
  });

  it('keeps a plate that has portions but no calorie figure', () => {
    const h = readHandoff({ p: 1 }, 'breakfast');
    expect(h!.plate.protein).toBe(1);
    expect(h!.kcal).toBe(0);
  });

  it('clamps portions to what the app’s own steppers could produce', () => {
    const h = readHandoff({ p: 99, v: -4, c: 2.6, e: 'nonsense' }, 'lunch');
    expect(h!.plate).toEqual({ protein: 8, veg: 0, carb: 3, extra: 0 });
  });

  it('falls back to the open slot when the sender guessed nothing usable', () => {
    expect(readHandoff({ ...RAMEN, slot: 'brunch' }, 'dinner')!.slot).toBe('dinner');
    expect(readHandoff({ ...RAMEN, slot: undefined }, 'snack')!.slot).toBe('snack');
  });

  it('drops a span that does not contain its own point estimate', () => {
    // A bar drawn from these would misrepresent the figure beside it.
    const h = readHandoff({ ...RAMEN, low: 2000, high: 2500 }, 'lunch');
    expect(h!.kcal).toBe(1170);
    expect(h!.low).toBe(0);
    expect(h!.high).toBe(0);
  });

  it('drops an inverted span', () => {
    const h = readHandoff({ ...RAMEN, low: 1450, high: 900 }, 'lunch');
    expect(h!.low).toBe(0);
    expect(h!.high).toBe(0);
  });

  it('only ever grants the weaker provenance to an unrecognised source', () => {
    expect(readHandoff({ ...RAMEN, source: 'label' }, 'lunch')!.source).toBe('label');
    // 'measured' is not a provenance this app hands out.
    expect(readHandoff({ ...RAMEN, source: 'measured' }, 'lunch')!.source).toBe('claude');
    expect(readHandoff({ ...RAMEN, source: 'photo' }, 'lunch')!.source).toBe('claude');
    expect(readHandoff(RAMEN, 'lunch')!.source).toBe('claude');
  });

  it('never reads fewer than one serving', () => {
    expect(readHandoff({ ...RAMEN, servings: 0 }, 'lunch')!.servings).toBe(1);
    expect(readHandoff({ ...RAMEN, servings: 3 }, 'lunch')!.servings).toBe(3);
  });

  it('truncates a name and place rather than storing whatever arrived', () => {
    const h = readHandoff({ ...RAMEN, name: 'x'.repeat(200), place: 'y'.repeat(200) }, 'lunch');
    expect(h!.name).toHaveLength(80);
    expect(h!.place).toHaveLength(60);
  });
});

describe('handoffFromUrl', () => {
  it('reads the estimate route', () => {
    const h = handoffFromUrl(
      'arise://estimate?kcal=1170&low=900&high=1450&protein=70&fibre=8&slot=lunch&name=Miso%20ramen&p=2&v=1&c=2&e=1',
      'dinner',
    );
    expect(h!.kcal).toBe(1170);
    expect(h!.name).toBe('Miso ramen');
    expect(h!.plate).toEqual({ protein: 2, veg: 1, carb: 2, extra: 1 });
  });

  it('ignores any other route, so an unrelated link cannot open the sheet', () => {
    expect(handoffFromUrl('arise://trend?kcal=1170&p=2', 'lunch')).toBeNull();
    expect(handoffFromUrl('arise://food/log?kcal=9999&p=8', 'lunch')).toBeNull();
  });

  it('is not fooled by an estimate-shaped path on another route', () => {
    expect(handoffFromUrl('arise://estimates?kcal=500&p=1', 'lunch')).toBeNull();
  });

  it('survives a URL it cannot parse', () => {
    expect(handoffFromUrl('not a url at all', 'lunch')).toBeNull();
    expect(handoffFromUrl('', 'lunch')).toBeNull();
  });
});

describe('handoffFromText', () => {
  it('reads the JSON block out of a pasted card', () => {
    const card = `Here is your plate:\n{"kcal":330,"protein":6,"source":"label","serving_g":25,"servings":3}\nType it in.`;
    const h = handoffFromText(card, 'snack');
    expect(h!.kcal).toBe(330);
    expect(h!.source).toBe('label');
    expect(h!.servings).toBe(3);
  });

  it('reads a pasted link too, so both transports share one parser', () => {
    const h = handoffFromText('  arise://estimate?kcal=800&p=1  ', 'lunch');
    expect(h!.kcal).toBe(800);
  });

  it('refuses prose, an empty paste, and broken JSON', () => {
    expect(handoffFromText('about 1200 calories I think', 'lunch')).toBeNull();
    expect(handoffFromText('   ', 'lunch')).toBeNull();
    expect(handoffFromText('{ "kcal": ', 'lunch')).toBeNull();
    expect(handoffFromText('[1,2,3]', 'lunch')).toBeNull();
  });
});

describe('draftFromHandoff', () => {
  it('carries a photo estimate over as portions, with its provenance', () => {
    const draft = draftFromHandoff(readHandoff(RAMEN, 'lunch')!);
    expect(draft.plate).toEqual({ protein: 2, veg: 1, carb: 2, extra: 1 });
    expect(draft.kcal).toBe(1170);
    expect(draft.source).toBe('claude');
    expect(draft.slot).toBe('lunch');
    expect(draft.grams).toBe(0);
  });

  it('gives a label read no portions, so its printed numbers are not overridden', () => {
    // The weekly estimate is built from the portion table whenever a portion is
    // above zero — portions here would throw away the most accurate input there is.
    const h = readHandoff(
      { kcal: 110, protein: 2, source: 'label', serving_g: 25, servings: 1, p: 1, c: 2 },
      'snack',
    )!;
    const draft = draftFromHandoff(h);
    expect(draft.plate).toEqual({ protein: 0, veg: 0, carb: 0, extra: 0 });
    expect(draft.kcal).toBe(110);
    expect(draft.grams).toBe(25);
    expect(draft.source).toBe('label');
  });

  it('scales a label by servings, and grams with it', () => {
    const h = readHandoff(
      { kcal: 110, protein: 2, fibre: 1, source: 'label', serving_g: 25, servings: 3 },
      'snack',
    )!;
    const draft = draftFromHandoff(h);
    expect(draft.kcal).toBe(330);
    expect(draft.protein_g).toBe(6);
    expect(draft.fibre_g).toBe(3);
    expect(draft.grams).toBe(75);
  });

  it('never scales a photo estimate — multiplying a guess compounds its error', () => {
    const h = { ...readHandoff(RAMEN, 'lunch')!, servings: 4 };
    expect(draftFromHandoff(h).kcal).toBe(1170);
  });
});

describe('the contract the skill documents', () => {
  // Verbatim from the skill's Step 6. If these drift apart the handoff breaks
  // silently, so the documented payload is pinned here rather than described.
  const MEAL =
    '{"kcal":1170,"low":900,"high":1450,"protein":70,"fibre":8,' +
    '"slot":"lunch","name":"Miso ramen with crispy pork","place":"",' +
    '"p":2,"v":1,"c":2,"e":1}';
  const LABEL =
    '{"kcal":110,"low":0,"high":0,"protein":2,"fibre":0,' +
    '"slot":"snack","name":"Skyflakes crackers","place":"",' +
    '"source":"label","serving_g":25,"servings":3,"pack_servings":8}';
  const LINK =
    'arise://estimate?kcal=1170&low=900&high=1450&protein=70&fibre=8' +
    '&slot=lunch&name=Miso%20ramen&p=2&v=1&c=2&e=1';

  it('reads the documented meal block', () => {
    const draft = draftFromHandoff(handoffFromText(MEAL, 'dinner')!);
    expect(draft.slot).toBe('lunch');
    expect(draft.name).toBe('Miso ramen with crispy pork');
    expect(draft.plate).toEqual({ protein: 2, veg: 1, carb: 2, extra: 1 });
    expect(draft.kcal).toBe(1170);
    expect(draft.source).toBe('claude');
  });

  it('reads the documented label block, scaled to three servings', () => {
    const h = handoffFromText(LABEL, 'lunch')!;
    expect(h.source).toBe('label');
    expect(h.pack_servings).toBe(8);
    const draft = draftFromHandoff(h);
    // 110 kcal per 25 g serving × 3 — the app does the multiplying, not the skill.
    expect(draft.kcal).toBe(330);
    expect(draft.protein_g).toBe(6);
    expect(draft.grams).toBe(75);
    expect(draft.slot).toBe('snack');
    // No range on a printed number, and no portions to override it.
    expect(sayHandoffRange(h)).toBe('');
    expect(draft.plate).toEqual({ protein: 0, veg: 0, carb: 0, extra: 0 });
  });

  it('reads the documented link form to the same plate', () => {
    const fromLink = handoffFromText(LINK, 'dinner')!;
    const fromJson = handoffFromText(MEAL, 'dinner')!;
    expect(fromLink.plate).toEqual(fromJson.plate);
    expect(fromLink.kcal).toBe(fromJson.kcal);
    expect(fromLink.low).toBe(fromJson.low);
    expect(fromLink.high).toBe(fromJson.high);
    expect(fromLink.slot).toBe(fromJson.slot);
  });
});

describe('sayHandoffRange', () => {
  it('states the span when there is one', () => {
    expect(sayHandoffRange(readHandoff(RAMEN, 'lunch')!)).toBe('range 900–1,450');
  });

  it('says nothing rather than inventing a spread around a bare figure', () => {
    const h = readHandoff({ kcal: 110, source: 'label' }, 'snack')!;
    expect(sayHandoffRange(h)).toBe('');
  });
});
