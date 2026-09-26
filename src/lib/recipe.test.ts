import { describe, expect, it } from 'vitest';

import type { ApiInsight } from '@/lib/api';
import { groceryName, ingredientLine, onList, recipeMeta, recipeText } from '@/lib/recipe';

const recipe = (over: Partial<ApiInsight> = {}): ApiInsight => ({
  id: 'r', source_url: 'https://tiktok.com/@chef/video/1', source: 'tiktok', kind: 'recipe',
  title: 'Garlic butter salmon', summary: 'Serves 2 · 20 min',
  takeaways: [], quotes: [], created_at: '',
  ingredients: [
    { amount: '2', item: 'salmon fillets' },
    { amount: '3 cloves', item: 'garlic, minced' },
    { amount: '', item: 'salt, to taste' },
  ],
  steps: ['Salt the salmon', 'Sear skin-side down, 4 min'],
  ...over,
});

describe('ingredientLine', () => {
  it('puts the amount first, and leaves it out when there is none', () => {
    expect(ingredientLine({ amount: '2 tbsp', item: 'butter' })).toBe('2 tbsp butter');
    expect(ingredientLine({ amount: '', item: 'salt, to taste' })).toBe('salt, to taste');
  });
});

describe('groceryName', () => {
  it('keeps what you buy and how much, not how to chop it', () => {
    expect(groceryName({ amount: '3 cloves', item: 'garlic, minced' })).toBe('garlic (3 cloves)');
    expect(groceryName({ amount: '', item: 'salt, to taste' })).toBe('salt');
    expect(groceryName({ amount: '2', item: 'salmon fillets' })).toBe('salmon fillets (2)');
  });

  it('fits the grocery list', () => {
    expect(groceryName({ amount: '1', item: 'x'.repeat(200) }).length).toBe(120);
  });
});

describe('onList', () => {
  it('knows an ingredient that is already waiting to be bought', () => {
    expect(onList({ amount: '2', item: 'salmon fillets' }, ['Salmon Fillets (2)'])).toBe(true);
    expect(onList({ amount: '2', item: 'salmon fillets' }, ['salmon fillets'])).toBe(false);
  });
});

describe('recipeText', () => {
  it('lays the recipe out as Markdown', () => {
    expect(recipeText(recipe())).toBe(
      [
        '# Garlic butter salmon',
        'Source: https://tiktok.com/@chef/video/1',
        '',
        'Serves 2 · 20 min',
        '',
        '## Ingredients',
        '- 2 salmon fillets',
        '- 3 cloves garlic, minced',
        '- salt, to taste',
        '',
        '## Method',
        '1. Salt the salmon',
        '2. Sear skin-side down, 4 min',
      ].join('\n'),
    );
  });

  it('leaves out what it has nothing for', () => {
    expect(recipeText(recipe({ steps: [], summary: '', source_url: '', title: '' }))).not.toMatch(/Method|Source/);
  });
});

describe('recipeMeta', () => {
  it('counts ingredients and steps and says where it came from', () => {
    expect(recipeMeta(recipe())).toBe('3 ingredients · 2 steps · video');
    expect(recipeMeta(recipe({ source: 'web', steps: [], ingredients: [{ amount: '', item: 'egg' }] }))).toBe(
      '1 ingredient · page',
    );
  });
});
