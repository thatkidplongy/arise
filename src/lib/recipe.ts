/**
 * A captured recipe as text: the line each ingredient reads as, what it goes on
 * the grocery list as, and the whole recipe for copying out.
 */

import type { ApiIngredient, ApiInsight } from '@/lib/api';

/** How an ingredient reads in the recipe: "2 tbsp butter", or just "salt, to taste". */
export function ingredientLine(ing: ApiIngredient): string {
  return ing.amount ? `${ing.amount} ${ing.item}` : ing.item;
}

/** What an ingredient goes on the grocery list as: the thing you buy, with how much
 * in brackets. The preparation after the comma ("garlic, minced") is the cook's
 * business, not the shop's. Kept within the list's 120-character limit. */
export function groceryName(ing: ApiIngredient): string {
  const thing = ing.item.split(',')[0].trim() || ing.item.trim();
  return (ing.amount ? `${thing} (${ing.amount})` : thing).slice(0, 120);
}

/** Whether an ingredient is already waiting on the list — the same words, any case. */
export function onList(ing: ApiIngredient, toBuy: string[]): boolean {
  const name = groceryName(ing).toLowerCase();
  return toBuy.some((g) => g.trim().toLowerCase() === name);
}

/** The whole recipe as Markdown, to paste into a chat or a note. */
export function recipeText(i: ApiInsight): string {
  const out: string[] = [`# ${i.title || 'Recipe'}`];
  if (i.source_url) out.push(`Source: ${i.source_url}`);
  if (i.summary) out.push('', i.summary);
  if (i.ingredients.length > 0) out.push('', '## Ingredients', ...i.ingredients.map((g) => `- ${ingredientLine(g)}`));
  if (i.steps.length > 0) out.push('', '## Method', ...i.steps.map((s, n) => `${n + 1}. ${s}`));
  return out.join('\n');
}

/** The line a collapsed card shows under the dish: how much is in it. */
export function recipeMeta(i: ApiInsight): string {
  const parts: string[] = [];
  const n = i.ingredients.length;
  const s = i.steps.length;
  if (n) parts.push(`${n} ingredient${n === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} step${s === 1 ? '' : 's'}`);
  parts.push(i.source === 'web' ? 'page' : 'video');
  return parts.join(' · ');
}
