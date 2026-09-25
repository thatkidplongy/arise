/**
 * The rules behind capturing a video: what counts as the same link, what a card
 * says while it's in flight, and why the Capture button is greyed out.
 *
 * Pure and React-free, so they're tested here rather than inferred from the
 * panel's behaviour. `canonical` especially — duplicate detection is built on
 * it, and until now the only way to check it was to paste a link twice and see
 * what happened.
 */

import type { ApiInsight, InsightKind } from '@/lib/api';
import type { PendingCapture } from '@/store/useCaptures';

// Normalise a link so we can spot the same video pasted twice — mirrors the
// server's clean_url enough to guard against re-hitting the API for a dupe.
export function canonical(raw: string): string {
  const u = raw.trim();
  const tt = u.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d+/i);
  if (tt) return tt[0].toLowerCase();
  const ig = u.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[\w-]+/i);
  if (ig) return ig[0].toLowerCase();
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `yt:${yt[1].toLowerCase()}`;
  return u.split('#')[0].split('?')[0].toLowerCase();
}

// A dupe only within the same mode — the backend keeps a video once per kind, so
// the same link can be captured as both Motivation and Tips.
export function duplicateOf(
  url: string,
  kind: InsightKind,
  pending: PendingCapture[],
  insights: ApiInsight[],
): 'pending' | 'done' | null {
  if (!url) return null;
  const c = canonical(url);
  if (pending.some((p) => p.kind === kind && canonical(p.url) === c)) return 'pending';
  if (insights.some((i) => i.kind === kind && i.source_url && canonical(i.source_url) === c))
    return 'done';
  return null;
}

// Free-text filter across a capture's words (no creator/source attribution).
export function matches(i: ApiInsight, q: string): boolean {
  if (!q) return true;
  return [i.summary, ...i.takeaways, ...i.steps, ...i.quotes].join(' ').toLowerCase().includes(q);
}

/** Why the Capture button is greyed out, or null when it isn't.
 *
 * Every case here is one that would spend an API call to learn something already
 * known — nothing typed, half a link, or a video captured under this mode before —
 * so the button says why instead of letting the request go out. Ordered from least
 * to most typed: a half-written link isn't a duplicate yet, it's just unfinished.
 */
export function describeCaptureBlock(
  url: string,
  looksValid: boolean,
  dup: 'pending' | 'done' | null,
): string | null {
  if (!url) return null;
  if (!looksValid) return 'Paste a full link — it should start with https://.';
  if (dup === 'pending') return 'That link is already being captured.';
  if (dup === 'done') return 'You’ve already captured that one — it’s in your list below.';
  return null;
}

/** What a capture in flight is doing, or that it didn't make it. */
export function pendingTitle(working: boolean, kind: InsightKind): string {
  if (!working) return 'Couldn’t capture this one';
  return kind === 'tips' ? 'Pulling out the tips…' : 'Listening & distilling…';
}

/** Which key is missing. The transcript comes first because without it there is
 * nothing for the model to distil — naming the second key first would send you
 * after the wrong one. */
export function gateMessage(transcriptOn: boolean, llmOn: boolean): string | null {
  if (!transcriptOn) return 'Add a free Supadata key (ARISE_SUPADATA_API_KEY) on the server to enable this.';
  if (!llmOn) return 'Distilling needs your Gemini key (ARISE_LLM_API_KEY).';
  return null;
}
