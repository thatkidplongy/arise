import { describe, expect, it } from 'vitest';

import type { ApiLearning, ApiStudy, StudySubject } from '@/lib/api';
import { isSittingFor, openPieceOf, studyKindOf } from '@/lib/study';

function card(subject: StudySubject, over: Partial<ApiStudy> = {}): ApiStudy {
  return {
    subject,
    stat: subject === 'craft' ? 'CFT' : 'INT',
    title: 'Study',
    unit: subject === 'craft' ? 'Phase' : 'Stage',
    phase: 1,
    phases: 5,
    label: 'Foundations',
    detail: 'a stretch',
    plan: ['one', 'two'],
    piece: 'one',
    steps: [],
    resource: '',
    source: '',
    done: 0,
    studied: 0,
    pieces: 2,
    progress: 0,
    is_last: false,
    pending: false,
    ...over,
  };
}

function log(over: Partial<ApiLearning> = {}): ApiLearning {
  return {
    id: 'l1',
    day: '2026-09-18',
    kind: 'other',
    source: 'one',
    text: 'what I took away',
    created_at: '2026-09-18T09:00:00Z',
    ...over,
  };
}

describe('openPieceOf', () => {
  it('is the source you picked on Craft, and the plan’s step on a walk', () => {
    expect(openPieceOf(card('craft', { source: 'DDIA ch 5' }))).toBe('DDIA ch 5');
    expect(openPieceOf(card('japanese', { piece: 'Hiragana: K row' }))).toBe('Hiragana: K row');
  });
});

describe('studyKindOf', () => {
  it('files only Craft as Notion, so a walk never advances the craft plan', () => {
    expect(studyKindOf(card('craft'))).toBe('notion');
    expect(studyKindOf(card('japanese'))).toBe('other');
    expect(studyKindOf(card('sketch'))).toBe('other');
  });
});

describe('isSittingFor', () => {
  it('counts any Notion sitting on a Craft day', () => {
    expect(isSittingFor(log({ kind: 'notion', source: 'anything' }), card('craft'))).toBe(true);
    expect(isSittingFor(log({ kind: 'book', source: 'anything' }), card('craft'))).toBe(false);
  });

  it('counts only the step being held on a walk', () => {
    const walk = card('sketch', { piece: 'Pure contour' });
    expect(isSittingFor(log({ source: 'Pure contour' }), walk)).toBe(true);
    expect(isSittingFor(log({ source: 'Upside down' }), walk)).toBe(false);
  });

  it('keeps a book logged from the capture off the walk’s card', () => {
    const walk = card('japanese', { piece: 'Hiragana: K row' });
    expect(isSittingFor(log({ kind: 'book', source: 'Hiragana: K row' }), walk)).toBe(false);
  });
});
