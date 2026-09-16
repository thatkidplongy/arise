import { describe, expect, it } from 'vitest';

import type { ApiQuest } from '@/lib/api';
import { isQuestDone, isWriteStep, resolveQuestProgress } from '@/lib/quests';

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

const quest = (over: Partial<ApiQuest>): ApiQuest => ({
  id: 'q',
  title: 'A quest',
  desc: '',
  resource: '',
  steps: [],
  steps_done: [],
  stat: 'STR',
  xp: 10,
  cadence: 'daily',
  target: 1,
  done: 0,
  undoable_id: null,
  notes: [],
  ...over,
});

describe('resolveQuestProgress', () => {
  it('ticks steps on a single-completion quest that has them', () => {
    const p = resolveQuestProgress(
      quest({ target: 1, steps: ['a', 'b', 'c', 'd'], steps_done: [true, true, false, false] }),
    );
    expect(p.useChecklist).toBe(true);
    expect(p.doneUnits).toBe(2);
    expect(p.totalUnits).toBe(4);
    expect(p.progress).toBe(0.5);
  });

  it('counts sessions on a multi-session quest, whose steps are guidance not a checklist', () => {
    const p = resolveQuestProgress(quest({ target: 4, done: 1, steps: ['a', 'b'], steps_done: [] }));
    expect(p.useChecklist).toBe(false);
    expect(p.doneUnits).toBe(1);
    expect(p.totalUnits).toBe(4);
    expect(p.progress).toBe(0.25);
  });

  it('reads full once done, whichever shape it is', () => {
    const ticked = resolveQuestProgress(
      quest({ target: 1, done: 1, steps: ['a', 'b'], steps_done: [true, false] }),
    );
    expect(ticked.progress).toBe(1);
    expect(ticked.doneUnits).toBe(2); // the window fills even with a step left unticked

    const logged = resolveQuestProgress(quest({ target: 3, done: 3 }));
    expect(logged.progress).toBe(1);
    expect(logged.doneUnits).toBe(3);
  });

  it('never overfills, for a quest logged one time too many', () => {
    expect(resolveQuestProgress(quest({ target: 2, done: 5 })).progress).toBe(1);
  });

  it('offers a step-down only on a multi-session quest part-way through', () => {
    expect(resolveQuestProgress(quest({ target: 4, done: 2 })).partialMulti).toBe(true);
    expect(resolveQuestProgress(quest({ target: 4, done: 0 })).partialMulti).toBe(false);
    expect(resolveQuestProgress(quest({ target: 4, done: 4 })).partialMulti).toBe(false);
    expect(resolveQuestProgress(quest({ target: 1, done: 0 })).partialMulti).toBe(false);
  });

  it('is an empty track, not a division by zero, when there is nothing to count', () => {
    expect(resolveQuestProgress(quest({ target: 0, done: 0 })).progress).toBe(0);
  });
});
