import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ACHIEVEMENTS } from '@/data/achievements';
import { DAILY_CLEAR_BONUS, DAILY_CLEAR_ID, DAILY_QUESTS, questById } from '@/data/quests';
import { dateKey } from '@/lib/dates';
import { levelInfo, rankFor, statLevelInfo } from '@/lib/leveling';
import * as sel from '@/lib/selectors';
import type { Notice, Snapshot, StatKey } from '@/types';

const EMPTY_STATS: Record<StatKey, number> = { STR: 0, CRE: 0, SPI: 0, CHA: 0, INT: 0 };

let noticeSeq = 0;
function makeNotice(title: string, lines: string[]): Notice {
  return { id: `n-${Date.now()}-${noticeSeq++}`, title, lines };
}

function buildSnapshot(
  totalXp: number,
  statXp: Record<StatKey, number>,
  log: sel.CompletionLog,
): Snapshot {
  const statLevels = Object.fromEntries(
    (Object.keys(statXp) as StatKey[]).map((k) => [k, statLevelInfo(statXp[k]).level]),
  ) as Record<StatKey, number>;
  return {
    totalXp,
    level: levelInfo(totalXp).level,
    statLevels,
    maxStreak: sel.maxStreak(log),
    dailyClears: sel.dailyClears(log),
    totalCompletions: sel.totalCompletions(log),
    sideCompletions: sel.sideCompletions(log),
    countOf: (questId) => sel.countAll(log, questId),
  };
}

interface SystemState {
  name: string;
  equippedTitle: string | null;
  totalXp: number;
  statXp: Record<StatKey, number>;
  log: sel.CompletionLog;
  /** achievementId -> ISO timestamp unlocked. */
  achievements: Record<string, string>;
  /** Queue of System pop-ups awaiting dismissal. Not persisted. */
  notices: Notice[];
  createdAt: string;

  completeQuest: (questId: string) => void;
  undoQuest: (questId: string) => void;
  setName: (name: string) => void;
  equipTitle: (title: string | null) => void;
  dismissNotice: () => void;
  resetAll: () => void;
}

export const useSystem = create<SystemState>()(
  persist(
    (set, get) => ({
      name: 'Hunter',
      equippedTitle: null,
      totalXp: 0,
      statXp: { ...EMPTY_STATS },
      log: {},
      achievements: {},
      notices: [],
      createdAt: new Date().toISOString(),

      completeQuest: (questId) => {
        const quest = questById(questId);
        if (!quest) return;
        const s = get();
        const today = dateKey();

        const done =
          quest.cadence === 'weekly'
            ? sel.countThisWeek(s.log, questId)
            : sel.countToday(s.log, questId);
        if (done >= quest.target) return;

        const before = levelInfo(s.totalXp);
        const beforeRank = rankFor(before.level, sel.maxStreak(s.log));

        const todayLog = [
          ...(s.log[today] ?? []),
          { questId, xp: quest.xp, at: new Date().toISOString() },
        ];
        const notices: Notice[] = [];
        let gained = quest.xp;

        if (quest.cadence === 'daily') {
          const cleared = DAILY_QUESTS.every(
            (q) => todayLog.filter((c) => c.questId === q.id).length >= q.target,
          );
          const bonusGiven = todayLog.some((c) => c.questId === DAILY_CLEAR_ID);
          if (cleared && !bonusGiven) {
            todayLog.push({ questId: DAILY_CLEAR_ID, xp: DAILY_CLEAR_BONUS, at: new Date().toISOString() });
            gained += DAILY_CLEAR_BONUS;
            notices.push(
              makeNotice('DAILY QUESTS CLEARED', [
                'All daily quests have been completed.',
                `Bonus reward: +${DAILY_CLEAR_BONUS} XP`,
              ]),
            );
          }
        }

        const log = { ...s.log, [today]: todayLog };
        const totalXp = s.totalXp + gained;
        const statXp = { ...s.statXp, [quest.stat]: s.statXp[quest.stat] + quest.xp };

        const after = levelInfo(totalXp);
        if (after.level > before.level) {
          notices.push(makeNotice('LEVEL UP', [`You have reached Level ${after.level}.`]));
        }
        const afterRank = rankFor(after.level, sel.maxStreak(log));
        if (afterRank !== beforeRank) {
          notices.push(
            makeNotice('RANK UP', [`Hunter rank increased: ${beforeRank} → ${afterRank}.`]),
          );
        }

        const snap = buildSnapshot(totalXp, statXp, log);
        const achievements = { ...s.achievements };
        for (const a of ACHIEVEMENTS) {
          if (!achievements[a.id] && a.check(snap)) {
            achievements[a.id] = new Date().toISOString();
            const lines = [a.desc];
            if (a.titleReward) lines.push(`Title acquired: “${a.titleReward}”`);
            notices.push(makeNotice(`ACHIEVEMENT — ${a.name}`, lines));
          }
        }

        set({ log, totalXp, statXp, achievements, notices: [...s.notices, ...notices] });
      },

      undoQuest: (questId) => {
        const s = get();
        const today = dateKey();
        const todayLog = [...(s.log[today] ?? [])];
        const idx = todayLog.map((c) => c.questId).lastIndexOf(questId);
        if (idx < 0) return;

        const [removed] = todayLog.splice(idx, 1);
        let lost = removed.xp;

        // Revoke the daily-clear bonus if the dailies are no longer all complete.
        const bonusIdx = todayLog.findIndex((c) => c.questId === DAILY_CLEAR_ID);
        if (bonusIdx >= 0) {
          const stillCleared = DAILY_QUESTS.every(
            (q) => todayLog.filter((c) => c.questId === q.id).length >= q.target,
          );
          if (!stillCleared) {
            lost += todayLog[bonusIdx].xp;
            todayLog.splice(bonusIdx, 1);
          }
        }

        const quest = questById(questId);
        const log = { ...s.log };
        if (todayLog.length > 0) log[today] = todayLog;
        else delete log[today];

        set({
          log,
          totalXp: Math.max(0, s.totalXp - lost),
          statXp: quest
            ? { ...s.statXp, [quest.stat]: Math.max(0, s.statXp[quest.stat] - removed.xp) }
            : s.statXp,
        });
      },

      setName: (name) => set({ name }),
      equipTitle: (title) => set({ equippedTitle: title }),
      dismissNotice: () => set({ notices: get().notices.slice(1) }),

      resetAll: () =>
        set({
          name: 'Hunter',
          equippedTitle: null,
          totalXp: 0,
          statXp: { ...EMPTY_STATS },
          log: {},
          achievements: {},
          notices: [],
          createdAt: new Date().toISOString(),
        }),
    }),
    {
      name: 'arise-system-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Notices are transient pop-ups; don't resurrect them on restart.
      partialize: (s) => ({
        name: s.name,
        equippedTitle: s.equippedTitle,
        totalXp: s.totalXp,
        statXp: s.statXp,
        log: s.log,
        achievements: s.achievements,
        createdAt: s.createdAt,
      }),
    },
  ),
);
