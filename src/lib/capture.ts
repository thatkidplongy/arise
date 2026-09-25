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

/** Fold the scheme and host, leave the path alone.
 *
 * A host is case-insensitive by definition; a path is not, and these platforms
 * put case-sensitive base62 ids in theirs. Folding the whole link would say
 * vt.tiktok.com/ZSabc123 and vt.tiktok.com/zsABC123 are one video and refuse the
 * second — a dedup that blocks a capture the hunter wanted, which is a worse
 * failure than one that lets a duplicate through. */
function foldHost(url: string): string {
  const m = url.match(/^(https?:\/\/[^/?#]+)(.*)$/i);
  return m ? m[1].toLowerCase() + m[2] : url;
}

/**
 * The key two links share when they're the same video.
 *
 * Built by rebuilding rather than by returning what matched, which is the part
 * that used to be wrong: an optional `(?:www\.)?` still leaves the www. in the
 * match, so the same TikTok pasted from the app and from the web keyed as two.
 * The server's clean_url makes the same judgements and is the one that actually
 * decides — this only saves the round trip, so the two have to agree.
 */
export function canonical(raw: string): string {
  const u = raw.trim();
  const tt = u.match(/https?:\/\/(?:www\.)?tiktok\.com\/@([\w.\-]+)\/video\/(\d+)/i);
  if (tt) return `https://tiktok.com/@${tt[1]}/video/${tt[2]}`;
  // Instagram serves a Reel at both /reel/ and /reels/ — one video, one key. A
  // /p/ post is a different thing and keeps its own.
  const reel = u.match(/https?:\/\/(?:www\.)?instagram\.com\/reels?\/([\w-]+)/i);
  if (reel) return `https://instagram.com/reel/${reel[1]}`;
  const post = u.match(/https?:\/\/(?:www\.)?instagram\.com\/p\/([\w-]+)/i);
  if (post) return `https://instagram.com/p/${post[1]}`;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `yt:${yt[1]}`;
  return foldHost(u.split('#')[0].split('?')[0]);
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
