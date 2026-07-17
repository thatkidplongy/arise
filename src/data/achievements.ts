import type { AchievementDef } from '@/types';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-quest',
    name: 'First Step',
    desc: 'Complete your first quest.',
    titleReward: 'The Awakened',
    check: (s) => s.totalCompletions >= 1,
  },
  {
    id: 'perfect-day',
    name: 'Perfect Day',
    desc: 'Clear all daily quests in a single day.',
    titleReward: 'Diligent One',
    check: (s) => s.dailyClears >= 1,
  },
  {
    id: 'clears-7',
    name: 'Relentless',
    desc: 'Clear all daily quests on 7 different days.',
    check: (s) => s.dailyClears >= 7,
  },
  {
    id: 'streak-7',
    name: 'Iron Will',
    desc: 'Reach a 7-day activity streak.',
    titleReward: 'Iron-Willed',
    check: (s) => s.maxStreak >= 7,
  },
  {
    id: 'streak-30',
    name: 'Unbreakable',
    desc: 'Reach a 30-day activity streak.',
    titleReward: 'The Unbreakable',
    check: (s) => s.maxStreak >= 30,
  },
  {
    id: 'badminton-10',
    name: 'Court Regular',
    desc: 'Complete 10 badminton raids.',
    check: (s) => s.countOf('w-badminton') >= 10,
  },
  {
    id: 'badminton-50',
    name: 'Shuttlecock Slayer',
    desc: 'Complete 50 badminton raids.',
    titleReward: 'Shuttlecock Slayer',
    check: (s) => s.countOf('w-badminton') >= 50,
  },
  {
    id: 'level-10',
    name: 'Second Awakening',
    desc: 'Reach Level 10.',
    check: (s) => s.level >= 10,
  },
  {
    id: 'level-25',
    name: 'Beyond the Gate',
    desc: 'Reach Level 25.',
    check: (s) => s.level >= 25,
  },
  {
    id: 'side-10',
    name: 'Wanderer',
    desc: 'Complete 10 side quests.',
    titleReward: 'Curious Explorer',
    check: (s) => s.sideCompletions >= 10,
  },
  {
    id: 'stat-10',
    name: 'Limit Break',
    desc: 'Raise any attribute to level 10.',
    titleReward: 'Limit Breaker',
    check: (s) => Object.values(s.statLevels).some((l) => l >= 10),
  },
  {
    id: 'xp-1000',
    name: 'Mana Reservoir',
    desc: 'Earn 1,000 total XP.',
    check: (s) => s.totalXp >= 1000,
  },
];
