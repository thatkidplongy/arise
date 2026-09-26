/**
 * A captured tutorial as text to take somewhere else — most often pasted into
 * another AI as context, which is what the card's Copy is for.
 *
 * Markdown because every chat model reads it natively and it still reads fine
 * as plain text in a note. The source link rides along so whatever reads it can
 * say where the points came from.
 */

import type { ApiInsight } from '@/lib/api';

export function tutorialText(i: ApiInsight): string {
  const out: string[] = [`# ${i.title || 'Tutorial'}`];
  if (i.source_url) out.push(`Source: ${i.source_url}`);
  if (i.summary) out.push('', i.summary);
  if (i.takeaways.length > 0) out.push('', '## Main points', ...i.takeaways.map((t) => `- ${t}`));
  if (i.steps.length > 0) out.push('', '## Steps', ...i.steps.map((s, n) => `${n + 1}. ${s}`));
  return out.join('\n');
}

/** The one line a collapsed card shows under its title: how much is in it. */
export function tutorialMeta(i: ApiInsight): string {
  const parts: string[] = [];
  const n = i.takeaways.length;
  const s = i.steps.length;
  if (n) parts.push(`${n} point${n === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} step${s === 1 ? '' : 's'}`);
  parts.push(i.source === 'web' ? 'article' : 'video');
  return parts.join(' · ');
}
