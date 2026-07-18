export type StatKey = 'STR' | 'CRE' | 'SPI' | 'CHA' | 'INT' | 'WLT' | 'CFT';

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

/** A queued System pop-up (level up, rank up, achievement...). */
export interface Notice {
  id: string;
  title: string;
  lines: string[];
}

/** A transient floating confirmation with an undo (e.g. a quest auto-completed). */
export interface Toast {
  id: string;
  title: string;
  xp: number;
  undo: { questId: string; stepIndex: number };
}
