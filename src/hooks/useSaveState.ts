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

/** The label a Save button shows for the current state (idle label passed in). */
export function saveLabel(state: SaveState, idle: string): string {
  return state === 'saving' ? 'Saving…' : state === 'done' ? 'Saved' : idle;
}
