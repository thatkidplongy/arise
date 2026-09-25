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
    expect(canonical('https://youtu.be/dQw4w9WgXcQ?si=abc123')).toBe('yt:dQw4w9WgXcQ');
    expect(canonical('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('yt:dQw4w9WgXcQ');
  });

  it('reads every YouTube spelling as the same video', () => {
    const watch = canonical('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(canonical('https://youtu.be/dQw4w9WgXcQ')).toBe(watch);
    expect(canonical('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(watch);
    expect(canonical('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(watch);
  });

  it('leaves a YouTube link with no video id in it alone', () => {
    // A channel or a playlist is not a video. Reading eleven characters out of
    // one anyway would key it as whatever that happened to spell.
    expect(canonical('https://www.youtube.com/@somechannel')).toBe('https://www.youtube.com/@somechannel');
    expect(canonical('https://www.youtube.com/playlist?list=PLabc123')).toBe(
      'https://www.youtube.com/playlist',
    );
  });

  it('drops what a TikTok share appends, and the host it was shared from', () => {
    expect(canonical('https://www.tiktok.com/@someone/video/12345?is_from_webapp=1')).toBe(
      'https://tiktok.com/@someone/video/12345',
    );
  });

  it('treats a Reel and a post path as themselves, not as each other', () => {
    expect(canonical('https://instagram.com/reel/AbC-1/')).not.toBe(canonical('https://instagram.com/p/AbC-1/'));
  });

  it('reads www. and the bare domain as the same video', () => {
    expect(canonical('https://www.tiktok.com/@x/video/1')).toBe(canonical('https://tiktok.com/@x/video/1'));
    expect(canonical('https://www.instagram.com/reel/A1/')).toBe(canonical('https://instagram.com/reel/A1/'));
    expect(canonical('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(canonical('https://youtu.be/dQw4w9WgXcQ'));
  });

  it('reads /reel/ and /reels/ as the same Reel — Instagram serves both', () => {
    expect(canonical('https://instagram.com/reel/A1/')).toBe(canonical('https://instagram.com/reels/A1/'));
  });

  // The ids these platforms put in a path are case-sensitive base62, so folding
  // case would say two different videos are the same one — a dedup that refuses a
  // capture the hunter actually wanted, which is worse than one that lets a
  // duplicate through.
  it('keeps the case of a share code, which is what tells two videos apart', () => {
    expect(canonical('https://vt.tiktok.com/ZSabc123/')).not.toBe(canonical('https://vt.tiktok.com/zsABC123/'));
    expect(canonical('https://youtu.be/dQw4w9WgXcQ')).not.toBe(canonical('https://youtu.be/DqW4W9WGXCq'));
    expect(canonical('https://instagram.com/reel/AbC1/')).not.toBe(canonical('https://instagram.com/reel/abc1/'));
  });

  it('still folds the case of the host, which is not', () => {
    expect(canonical('https://VT.TikTok.com/ZSabc123/')).toBe(canonical('https://vt.tiktok.com/ZSabc123/'));
  });

  it('falls back to the link without its query or fragment', () => {
    expect(canonical('https://Example.com/A/B?utm=x#frag')).toBe('https://example.com/A/B');
  });

  it('ignores surrounding whitespace, which a paste usually brings', () => {
    expect(canonical('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('yt:dQw4w9WgXcQ');
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
