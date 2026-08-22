export type StatKey = 'STR' | 'CRE' | 'SPI' | 'CHA' | 'INT' | 'WLT' | 'CFT';

/** The seven, in the order they're always shown. */
export const STAT_KEYS: StatKey[] = ['STR', 'CRE', 'SPI', 'CHA', 'INT', 'WLT', 'CFT'];

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

/** A queued System pop-up (level up, rank up, achievement...). */
export interface Notice {
  id: string;
  title: string;
  lines: string[];
  /** Worth a burst of poppers. False for the ones that are only news — a lost
   * connection arrives through the same window as a rank up, and confetti over
   * "Access denied" would be the app laughing at you. */
  celebrate: boolean;
}

/**
 * How to take back what a toast is confirming. A quest reaches done two ways and
 * they reverse differently: ticking the last step un-ticks that step, while tapping
 * the check circle undoes the completion itself.
 */
export type ToastUndo =
  | { kind: 'step'; questId: string; stepIndex: number }
  | { kind: 'completion'; questId: string };

/** A transient floating confirmation with an undo (e.g. a quest was completed). */
export interface Toast {
  id: string;
  title: string;
  xp: number;
  undo: ToastUndo;
}
