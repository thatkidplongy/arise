import { describe, expect, it } from 'vitest';

import { isQuestDone, isWriteStep } from '@/lib/quests';

describe('isQuestDone', () => {
  it('is done at the target, not one past it', () => {
    expect(isQuestDone({ done: 1, target: 1 })).toBe(true);
    expect(isQuestDone({ done: 0, target: 1 })).toBe(false);
  });

  it('counts a multi-session quest by its sessions', () => {
    expect(isQuestDone({ done: 2, target: 3 })).toBe(false);
    expect(isQuestDone({ done: 3, target: 3 })).toBe(true);
  });

  it('stays done past the target, for a quest logged one time too many', () => {
    expect(isQuestDone({ done: 4, target: 3 })).toBe(true);
  });
});

describe('isWriteStep', () => {
  it('catches the journaling verbs', () => {
    expect(isWriteStep('Write down what you noticed')).toBe(true);
    expect(isWriteStep('Jot one line about it')).toBe(true);
    expect(isWriteStep('Reflect on how that went')).toBe(true);
  });

  it('reads a question as a prompt to answer in writing', () => {
    expect(isWriteStep('What drained you today?')).toBe(true);
  });

  it('leaves a do-step alone even when it is phrased with a writing verb', () => {
    expect(isWriteStep('Write a function that reverses a list')).toBe(false);
    expect(isWriteStep('Note the melody down in MIDI')).toBe(false);
    expect(isWriteStep('Do 3 × 12 push-ups')).toBe(false);
  });

  it('does not read a drill phrased as a question as journaling', () => {
    expect(isWriteStep('Can you write the kana from memory?')).toBe(false);
  });
});
