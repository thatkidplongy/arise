import type { QuestDef } from '@/types';

/** Bonus XP for clearing all five daily quests in one day. */
export const DAILY_CLEAR_BONUS = 15;

/** Pseudo quest id used to log the daily-clear bonus in the completion log. */
export const DAILY_CLEAR_ID = 'daily-clear';

export const QUESTS: QuestDef[] = [
  // ── Daily quests — the non-negotiable core loop ──────────────────────────
  {
    id: 'd-train',
    title: 'Hunter Conditioning',
    desc: '15 min of footwork, jump rope, or strength work',
    stat: 'STR',
    xp: 10,
    cadence: 'daily',
    target: 1,
  },
  {
    id: 'd-sketch',
    title: 'Daily Sketch',
    desc: 'Draw for 20 minutes — anything counts',
    stat: 'CRE',
    xp: 10,
    cadence: 'daily',
    target: 1,
  },
  {
    id: 'd-meditate',
    title: 'Inner Gate',
    desc: 'Meditate for 10 minutes',
    stat: 'SPI',
    xp: 10,
    cadence: 'daily',
    target: 1,
  },
  {
    id: 'd-connect',
    title: 'Send a Signal',
    desc: 'Reach out to a friend or family member',
    stat: 'CHA',
    xp: 10,
    cadence: 'daily',
    target: 1,
  },
  {
    id: 'd-read',
    title: 'Grimoire Study',
    desc: 'Read for 20 minutes',
    stat: 'INT',
    xp: 10,
    cadence: 'daily',
    target: 1,
  },

  // ── Weekly quests — the raids ────────────────────────────────────────────
  {
    id: 'w-badminton',
    title: 'Dungeon Raid: Badminton',
    desc: 'Play a badminton session',
    stat: 'STR',
    xp: 40,
    cadence: 'weekly',
    target: 2,
  },
  {
    id: 'w-hangout',
    title: 'Party Gathering',
    desc: 'Spend real time with people you like',
    stat: 'CHA',
    xp: 50,
    cadence: 'weekly',
    target: 1,
  },
  {
    id: 'w-piece',
    title: 'Finish a Piece',
    desc: 'Complete one drawing, start to finish',
    stat: 'CRE',
    xp: 40,
    cadence: 'weekly',
    target: 1,
  },
  {
    id: 'w-tome',
    title: 'Clear the Tome',
    desc: 'Finish 3 chapters of your current book',
    stat: 'INT',
    xp: 40,
    cadence: 'weekly',
    target: 1,
  },
  {
    id: 'w-still',
    title: 'Deep Stillness',
    desc: 'One 30-minute meditation session',
    stat: 'SPI',
    xp: 30,
    cadence: 'weekly',
    target: 1,
  },

  // ── Side quests — optional bonus XP, once per day each ───────────────────
  {
    id: 's-drill',
    title: 'New Technique',
    desc: 'Practice a badminton shot or drill you struggle with',
    stat: 'STR',
    xp: 15,
    cadence: 'side',
    target: 1,
  },
  {
    id: 's-brave',
    title: 'Beyond the Comfort Zone',
    desc: 'Draw a subject you usually avoid',
    stat: 'CRE',
    xp: 15,
    cadence: 'side',
    target: 1,
  },
  {
    id: 's-nature',
    title: 'Nature Attunement',
    desc: 'Meditate or take a mindful walk outdoors',
    stat: 'SPI',
    xp: 15,
    cadence: 'side',
    target: 1,
  },
  {
    id: 's-ally',
    title: 'New Ally',
    desc: 'Have a real conversation with someone new',
    stat: 'CHA',
    xp: 15,
    cadence: 'side',
    target: 1,
  },
  {
    id: 's-code',
    title: 'Arcane Study: Code',
    desc: '30 minutes learning React Native (building this app counts)',
    stat: 'INT',
    xp: 15,
    cadence: 'side',
    target: 1,
  },
];

export const DAILY_QUESTS = QUESTS.filter((q) => q.cadence === 'daily');
export const WEEKLY_QUESTS = QUESTS.filter((q) => q.cadence === 'weekly');
export const SIDE_QUESTS = QUESTS.filter((q) => q.cadence === 'side');

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}
