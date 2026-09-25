import { describe, expect, it } from 'vitest';

import type { ApiInsight } from '@/lib/api';
import { canonical, describeCaptureBlock, duplicateOf, gateMessage, matches, pendingTitle } from '@/lib/capture';
import type { PendingCapture } from '@/store/useCaptures';

const insight = (over: Partial<ApiInsight>): ApiInsight =>
  ({
    id: 'i', kind: 'motivation', source_url: '', source_title: '', creator: '',
    summary: '', takeaways: [], steps: [], quotes: [], created_at: '',
    ...over,
  }) as ApiInsight;

const pending = (over: Partial<PendingCapture>): PendingCapture =>
  ({ tempId: 't', url: '', kind: 'motivation', status: 'working', error: '', ...over }) as PendingCapture;

describe('canonical', () => {
  it('strips the tracking tail a share sheet adds', () => {
    expect(canonical('https://youtu.be/dQw4w9WgXcQ?si=abc123')).toBe('yt:dqw4w9wgxcq');
    expect(canonical('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('yt:dqw4w9wgxcq');
  });

  it('reads the two YouTube spellings as the same video', () => {
    expect(canonical('https://youtu.be/dQw4w9WgXcQ')).toBe(canonical('https://youtube.com/watch?v=dQw4w9WgXcQ'));
  });

  it('drops what a TikTok share appends', () => {
    expect(canonical('https://www.tiktok.com/@someone/video/12345?is_from_webapp=1')).toBe(
      'https://www.tiktok.com/@someone/video/12345',
    );
  });

  it('treats a Reel and a post path as themselves, not as each other', () => {
    expect(canonical('https://instagram.com/reel/AbC-1/')).not.toBe(canonical('https://instagram.com/p/AbC-1/'));
  });

  // Characterisation, not endorsement. The host survives into the key for TikTok
  // and Instagram, so www. and the bare domain read as two different videos and
  // the same Reel can be captured twice. YouTube is immune because it keeps only
  // the id. Pinned here so the gap is visible and so a fix is a red test first.
  it('does NOT yet see www. and the bare domain as the same video', () => {
    expect(canonical('https://www.tiktok.com/@x/video/1')).not.toBe(canonical('https://tiktok.com/@x/video/1'));
    expect(canonical('https://www.instagram.com/reel/A1/')).not.toBe(canonical('https://instagram.com/reel/A1/'));
    // The one that does get it right, for contrast.
    expect(canonical('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(canonical('https://youtu.be/dQw4w9WgXcQ'));
  });

  // Same shape: Instagram serves both spellings, and they key differently.
  it('does NOT yet see /reel/ and /reels/ as the same Reel', () => {
    expect(canonical('https://instagram.com/reel/A1/')).not.toBe(canonical('https://instagram.com/reels/A1/'));
  });

  it('falls back to the link without its query or fragment', () => {
    expect(canonical('https://Example.com/A/B?utm=x#frag')).toBe('https://example.com/a/b');
  });

  it('ignores surrounding whitespace, which a paste usually brings', () => {
    expect(canonical('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('yt:dqw4w9wgxcq');
  });
});

describe('duplicateOf', () => {
  const url = 'https://youtu.be/dQw4w9WgXcQ';

  it('finds nothing in an empty field', () => {
    expect(duplicateOf('', 'motivation', [], [])).toBeNull();
  });

  it('spots one already in flight, however it was spelled', () => {
    const inFlight = [pending({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9' })];
    expect(duplicateOf(url, 'motivation', inFlight, [])).toBe('pending');
  });

  it('spots one already captured', () => {
    const kept = [insight({ source_url: url })];
    expect(duplicateOf(url, 'motivation', [], kept)).toBe('done');
  });

  it('lets the same video be captured once as motivation and once as tips', () => {
    const kept = [insight({ kind: 'motivation', source_url: url })];
    expect(duplicateOf(url, 'motivation', [], kept)).toBe('done');
    expect(duplicateOf(url, 'tips', [], kept)).toBeNull();
  });

  it('is not fooled by a kept capture that never recorded its link', () => {
    expect(duplicateOf(url, 'motivation', [], [insight({ source_url: '' })])).toBeNull();
  });
});

describe('matches', () => {
  const i = insight({ summary: 'Depth beats speed', takeaways: ['Sit with one idea'], steps: ['Open the book'], quotes: ['The winding path'] });

  it('matches nothing in particular when the box is empty', () => {
    expect(matches(i, '')).toBe(true);
  });

  it('searches the summary, takeaways, steps and quotes alike', () => {
    expect(matches(i, 'depth')).toBe(true);
    expect(matches(i, 'sit with')).toBe(true);
    expect(matches(i, 'open the')).toBe(true);
    expect(matches(i, 'winding')).toBe(true);
    expect(matches(i, 'nowhere')).toBe(false);
  });
});

describe('describeCaptureBlock', () => {
  it('says nothing before anything is typed', () => {
    expect(describeCaptureBlock('', false, null)).toBeNull();
  });

  it('asks for a whole link before it asks anything else', () => {
    expect(describeCaptureBlock('youtu.be/x', false, 'done')).toMatch(/full link/);
  });

  it('names the duplicate once the link is whole', () => {
    expect(describeCaptureBlock('https://youtu.be/x', true, 'pending')).toMatch(/already being captured/);
    expect(describeCaptureBlock('https://youtu.be/x', true, 'done')).toMatch(/already captured/);
  });

  it('says nothing when there is nothing wrong', () => {
    expect(describeCaptureBlock('https://youtu.be/x', true, null)).toBeNull();
  });
});

describe('pendingTitle', () => {
  it('says which kind of work is under way', () => {
    expect(pendingTitle(true, 'tips')).toMatch(/tips/i);
    expect(pendingTitle(true, 'motivation')).toMatch(/distilling/i);
  });

  it('says so plainly when it failed, whichever kind it was', () => {
    expect(pendingTitle(false, 'tips')).toBe(pendingTitle(false, 'motivation'));
  });
});

describe('gateMessage', () => {
  it('names the transcript key first — without it there is nothing to distil', () => {
    expect(gateMessage(false, false)).toMatch(/SUPADATA/);
  });

  it('names the model key once a transcript can be fetched', () => {
    expect(gateMessage(true, false)).toMatch(/LLM_API_KEY/);
  });

  it('is silent when both keys are set', () => {
    expect(gateMessage(true, true)).toBeNull();
  });
});
