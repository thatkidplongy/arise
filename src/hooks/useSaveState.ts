import { useEffect, useRef, useState } from 'react';

import { useSystem } from '@/store/useSystem';

export type SaveState = 'idle' | 'saving' | 'done';

/**
 * Drives a Save button's idle → saving → done → idle feedback. `run(fn)` sets
 * 'saving', awaits the write, then flashes 'done' (for `holdMs`) only if it
 * actually reached the server — otherwise it drops straight back to 'idle' (the
 * failure already shows via the link status / a notice). It returns whether the
 * write landed, so callers can gate on-success side effects (e.g. clearing a
 * draft) on the same signal.
 */
export function useSaveState(holdMs = 1600) {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setState('saving');
    await fn();
    const online = useSystem.getState().status === 'online';
    if (online) {
      setState('done');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), holdMs);
    } else {
      setState('idle');
    }
    return online;
  };

  return { state, run };
}

/** The label a Save button shows for the current state (idle label passed in).
 * `saving` and `done` override it, because a button mid-write should say so in the
 * same words everywhere. */
export function saveLabel(state: SaveState, idle: string): string {
  if (state === 'saving') return 'Saving…';
  if (state === 'done') return 'Saved';
  return idle;
}

/** Whether a write is in flight — what a button's `busy` prop wants. */
export function isSaving(state: SaveState): boolean {
  return state === 'saving';
}
