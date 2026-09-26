import { describe, expect, it } from 'vitest';

import type { ApiInsight } from '@/lib/api';
import { tutorialMeta, tutorialText } from '@/lib/tutorial';

const tutorial = (over: Partial<ApiInsight> = {}): ApiInsight => ({
  id: 'i', source_url: 'https://example.com/pg', source: 'web', kind: 'tutorial',
  title: 'Postgres on a Mac', summary: 'Setting up Postgres for local work.',
  takeaways: ['Use one role per app', 'Keep data out of the repo'],
  steps: ['brew install postgresql@16', 'createdb app'],
  ingredients: [], quotes: [], created_at: '',
  ...over,
});

describe('tutorialText', () => {
  it('lays a tutorial out as Markdown with its source', () => {
    expect(tutorialText(tutorial())).toBe(
      [
        '# Postgres on a Mac',
        'Source: https://example.com/pg',
        '',
        'Setting up Postgres for local work.',
        '',
        '## Main points',
        '- Use one role per app',
        '- Keep data out of the repo',
        '',
        '## Steps',
        '1. brew install postgresql@16',
        '2. createdb app',
      ].join('\n'),
    );
  });

  it('leaves out the sections it has nothing for', () => {
    const text = tutorialText(tutorial({ steps: [], summary: '', source_url: '' }));
    expect(text).not.toMatch(/Steps|Source/);
    expect(text).toBe('# Postgres on a Mac\n\n## Main points\n- Use one role per app\n- Keep data out of the repo');
  });

  it('still has a heading when nothing named it', () => {
    expect(tutorialText(tutorial({ title: '' })).startsWith('# Tutorial\n')).toBe(true);
  });
});

describe('tutorialMeta', () => {
  it('counts what is inside and says what it came from', () => {
    expect(tutorialMeta(tutorial())).toBe('2 points · 2 steps · article');
    expect(tutorialMeta(tutorial({ source: 'youtube', steps: [], takeaways: ['a'] }))).toBe('1 point · video');
  });
});
