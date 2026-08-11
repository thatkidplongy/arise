import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  api,
  UnauthorizedError,
  type ApiBook,
  type ApiBookShelf,
  type ApiEvent,
  type ApiQuest,
  type ApiState,
  type LearningKind,
  type RecallGrade,
} from '@/lib/api';
import { dateKey } from '@/lib/dates';
import type { Notice, StatKey, Toast } from '@/types';

function computeDefaultServerUrl(): string {
  // Web build served straight from the backend → talk to its own origin, so
  // the home-screen app auto-connects with zero setup (and no CORS).
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location;
    // In Metro dev the page is on :8081 but the API is on :8000.
    return port === '8081' ? `${protocol}//${hostname}:8000` : origin;
  }
  // In Expo Go / dev builds, hostUri is "<dev-machine-lan-ip>:8081" — so the
  // phone finds the backend on the same machine with zero configuration.
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return devHost ? `http://${devHost}:8000` : 'http://localhost:8000';
}

export const DEFAULT_SERVER_URL = computeDefaultServerUrl();

export type LinkStatus = 'connecting' | 'online' | 'offline' | 'unauthorized';

let noticeSeq = 0;
function makeNotice(title: string, lines: string[]): Notice {
  return { id: `n-${Date.now()}-${noticeSeq++}`, title, lines };
}

/** Translate server events into System pop-ups. */
export function noticesFrom(events: ApiEvent[]): Notice[] {
  return events.map((e) => {
    switch (e.type) {
      case 'daily_clear':
        return makeNotice('You showed up across the board today', [
          'That’s a full day of showing up — no small thing.',
          `A little bonus for it: +${e.data.bonus_xp} XP`,
        ]);
      case 'level_up':
        return makeNotice('Level up', [`You have reached Level ${e.data.level}.`]);
      case 'rank_up':
        return makeNotice('Rank up', [`Hunter rank increased: ${e.data.from} → ${e.data.to}.`]);
      case 'achievement': {
        const lines = [e.data.desc as string];
        if (e.data.title_reward) lines.push(`Title acquired: “${e.data.title_reward}”`);
        return makeNotice(`Achievement · ${e.data.name}`, lines);
      }
      default:
        return makeNotice('SYSTEM', [JSON.stringify(e.data)]);
    }
  });
}

const CONNECTION_LOST = () =>
  makeNotice('Connection lost', [
    'The System server is unreachable.',
    'Check Settings → System link.',
  ]);

const ACCESS_DENIED = () =>
  makeNotice('Access denied', [
    'The System rejected your access token.',
    'Set the correct token in Settings → System link.',
  ]);

/** Map a thrown request error to the status + notice it should produce.
 * (The notice is only shown for user-initiated actions, not passive refresh.) */
export function errorOutcome(e: unknown): { status: LinkStatus; notice: Notice } {
  if (e instanceof UnauthorizedError) return { status: 'unauthorized', notice: ACCESS_DENIED() };
  return { status: 'offline', notice: CONNECTION_LOST() };
}

/** A completion toast's id (kept unique alongside notices). */
export function toastId(): string {
  return `t-${Date.now()}-${noticeSeq++}`;
}

export interface SystemStore {
  serverUrl: string;
  apiToken: string;
  state: ApiState | null;
  status: LinkStatus;
  notices: Notice[];
  toast: Toast | null;

  refresh: () => Promise<void>;
  complete: (quest: ApiQuest) => Promise<void>;
  undo: (quest: ApiQuest) => Promise<void>;
  toggleStep: (quest: ApiQuest, stepIndex: number) => Promise<void>;
  undoToast: () => Promise<void>;
  dismissToast: () => void;
  saveName: (name: string) => Promise<void>;
  equipTitle: (title: string | null) => Promise<void>;
  saveNorthStar: (northStar: string) => Promise<void>;
  savePreferences: (
    preferences: Partial<Record<StatKey, string[]>>,
    levels?: Partial<Record<StatKey, string>>,
  ) => Promise<void>;
  addReminder: (text: string) => Promise<void>;
  toggleReminder: (id: string, done: boolean) => Promise<void>;
  removeReminder: (id: string) => Promise<void>;
  addGrocery: (name: string) => Promise<void>;
  toggleGrocery: (id: string, bought: boolean) => Promise<void>;
  removeGrocery: (id: string) => Promise<void>;
  addMoney: (
    amount: number,
    direction: 'in' | 'out',
    note: string,
    bucket?: 'needs' | 'wants' | null,
  ) => Promise<void>;
  payCommitment: (id: string, amount?: number) => Promise<void>;
  removeMoney: (id: string) => Promise<void>;
  resetMoney: () => Promise<void>;
  setIncome: (monthlyIncome: number) => Promise<void>;
  addCommitment: (commitment: {
    label: string;
    amount: number;
    bucket: 'needs' | 'wants';
    due_day?: number;
    variable?: boolean;
  }) => Promise<void>;
  updateCommitment: (
    id: string,
    patch: Partial<{
      label: string;
      amount: number;
      bucket: 'needs' | 'wants';
      due_day: number;
      variable: boolean;
      active: boolean;
    }>,
  ) => Promise<void>;
  removeCommitment: (id: string) => Promise<void>;
  setPriority: (stat: StatKey, focus: string, scope: 'day' | 'week' | 'open') => Promise<void>;
  clearPriority: (stat: StatKey) => Promise<void>;
  addQuestNote: (questId: string, text: string, prompt?: string, stepIndex?: number | null) => Promise<void>;
  updateQuestNote: (id: string, text: string) => Promise<void>;
  removeQuestNote: (id: string) => Promise<void>;
  addJournalEntry: (text: string) => Promise<void>;
  updateJournalEntry: (id: string, text: string) => Promise<void>;
  removeJournalEntry: (id: string) => Promise<void>;
  addLearning: (entry: { kind: LearningKind; source: string; text: string }) => Promise<void>;
  removeLearning: (id: string) => Promise<void>;
  gradeRecall: (id: string, grade: RecallGrade) => Promise<void>;
  generate: () => Promise<void>;
  toggleRest: () => Promise<void>;
  saveBook: (currentBook: string, chapters?: number) => Promise<void>;
  logReading: (chapters: number, label: string) => Promise<void>;
  removeReadingLog: (id: string) => Promise<void>;
  reviewBook: (finished: boolean, nextBook: string) => Promise<void>;
  reviewCraftPhase: (done: boolean) => Promise<void>;
  setCraftSource: (source: string) => Promise<void>;
  setInterviewMode: (enabled: boolean) => Promise<void>;
  searchBooks: (q: string) => Promise<ApiBook[]>;
  suggestBooks: () => Promise<ApiBookShelf[]>;
  resetAll: () => Promise<void>;
  setServerUrl: (url: string) => void;
  setApiToken: (token: string) => void;
  dismissNotice: () => void;
}

export const useSystemStore = create<SystemStore>()(
  persist(
    (set, get) => {
      // Shared shape for a mutation that returns fresh state: run it, commit the
      // state, route any error to a user-facing notice. Reads serverUrl/token/
      // notices fresh at call time, exactly as the hand-written actions did.
      const mutate = async (
        fn: (base: string, token: string, day: string) => Promise<ApiState>,
      ): Promise<void> => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await fn(serverUrl, apiToken, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      };

      return {
      serverUrl: DEFAULT_SERVER_URL,
      apiToken: '',
      state: null,
      status: 'connecting',
      notices: [],
      toast: null,

      refresh: async () => {
        const { serverUrl, apiToken, state } = get();
        if (!state) set({ status: 'connecting' });
        try {
          const fresh = await api.state(serverUrl, apiToken, dateKey());
          set({ state: fresh, status: 'online' });
          // If the LLM is on, personalise this period in the background — the
          // pool-based board is already showing; it quietly upgrades when ready.
          if (fresh.llm_enabled) void get().generate();
        } catch (e) {
          // Passive refresh is silent — the ConnectionPanel communicates the
          // problem (offline vs unauthorized). No pop-up on load.
          set({ status: errorOutcome(e).status });
        }
      },

      complete: async (quest) => {
        const { serverUrl, apiToken, notices } = get();
        if (quest.done >= quest.target) return;
        try {
          const { events, state } = await api.complete(serverUrl, apiToken, quest.id, dateKey());
          // Tapping the check circle deserves the same floating confirmation as
          // ticking the last step did — without it a save that worked looks like
          // nothing happened. Only once it's actually at target, so a quest that
          // takes several reps isn't told it's complete on the first one.
          const fresh = state.quests.find((q) => q.id === quest.id);
          const isDone = !!fresh && fresh.done >= fresh.target;
          set({
            state,
            status: 'online',
            notices: [...notices, ...noticesFrom(events)],
            toast: isDone
              ? { id: toastId(), title: quest.title, xp: quest.xp, undo: { kind: 'completion', questId: quest.id } }
              : null,
          });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      undo: async (quest) => {
        const { serverUrl, apiToken, notices } = get();
        if (!quest.undoable_id) return;
        try {
          const { state } = await api.undo(serverUrl, apiToken, quest.undoable_id, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      toggleStep: async (quest, stepIndex) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const { events, state, completed } = await api.toggleStep(
            serverUrl,
            apiToken,
            quest.id,
            stepIndex,
            dateKey(),
          );
          set({
            state,
            status: 'online',
            notices: [...notices, ...noticesFrom(events)],
            // A completion pops a floating toast with undo; any other toggle
            // clears a lingering one.
            toast: completed
              ? {
                  id: toastId(),
                  title: quest.title,
                  xp: quest.xp,
                  undo: { kind: 'step', questId: quest.id, stepIndex },
                }
              : null,
          });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      undoToast: async () => {
        const t = get().toast;
        if (!t) return;
        const { serverUrl, apiToken, state } = get();
        set({ toast: null });
        // Undo the way it was done: un-tick the step that finished it, or reverse the
        // completion itself (its id comes from the state the completion returned).
        const undoableId =
          t.undo.kind === 'completion'
            ? state?.quests.find((q) => q.id === t.undo.questId)?.undoable_id
            : undefined;
        if (t.undo.kind === 'completion' && !undoableId) return;
        try {
          const fresh =
            t.undo.kind === 'step'
              ? await api.toggleStep(serverUrl, apiToken, t.undo.questId, t.undo.stepIndex, dateKey())
              : await api.undo(serverUrl, apiToken, undoableId as string, dateKey());
          set({ state: fresh.state, status: 'online' });
        } catch (e) {
          set({ status: errorOutcome(e).status });
        }
      },

      dismissToast: () => set({ toast: null }),

      saveName: (name) => mutate((b, t, d) => api.updatePlayer(b, t, { name }, d)),
      equipTitle: (title) => mutate((b, t, d) => api.updatePlayer(b, t, { equipped_title: title }, d)),
      saveNorthStar: (northStar) => mutate((b, t, d) => api.updatePlayer(b, t, { north_star: northStar }, d)),
      toggleRest: () => mutate((b, t, d) => api.toggleRest(b, t, d)),
      savePreferences: (preferences, levels = {}) =>
        mutate((b, t, d) => api.updatePreferences(b, t, preferences, levels, d)),
      addReminder: (text) => mutate((b, t, d) => api.addReminder(b, t, text, d)),
      toggleReminder: (id, done) => mutate((b, t, d) => api.toggleReminder(b, t, id, done, d)),
      removeReminder: (id) => mutate((b, t, d) => api.removeReminder(b, t, id, d)),
      addGrocery: (name) => mutate((b, t, d) => api.addGrocery(b, t, name, d)),
      toggleGrocery: (id, bought) => mutate((b, t, d) => api.toggleGrocery(b, t, id, bought, d)),
      removeGrocery: (id) => mutate((b, t, d) => api.removeGrocery(b, t, id, d)),
      addMoney: (amount, direction, note, bucket = null) =>
        mutate((b, t, d) => api.addMoney(b, t, amount, direction, note, d, bucket)),
      payCommitment: (id, amount) => mutate((b, t, d) => api.payCommitment(b, t, id, d, amount)),
      removeMoney: (id) => mutate((b, t, d) => api.removeMoney(b, t, id, d)),
      resetMoney: () => mutate((b, t, d) => api.resetMoney(b, t, d)),
      setIncome: (monthlyIncome) => mutate((b, t, d) => api.setIncome(b, t, monthlyIncome, d)),
      addCommitment: (commitment) => mutate((b, t, d) => api.addCommitment(b, t, commitment, d)),
      updateCommitment: (id, patch) => mutate((b, t, d) => api.updateCommitment(b, t, id, patch, d)),
      removeCommitment: (id) => mutate((b, t, d) => api.removeCommitment(b, t, id, d)),
      setPriority: (stat, focus, scope) => mutate((b, t, d) => api.setPriority(b, t, stat, focus, scope, d)),
      clearPriority: (stat) => mutate((b, t, d) => api.clearPriority(b, t, stat, d)),
      addQuestNote: (questId, text, prompt = '', stepIndex = null) =>
        mutate((b, t, d) => api.addQuestNote(b, t, questId, text, d, prompt, stepIndex)),
      updateQuestNote: (id, text) => mutate((b, t, d) => api.updateQuestNote(b, t, id, text, d)),
      removeQuestNote: (id) => mutate((b, t, d) => api.removeQuestNote(b, t, id, d)),
      addJournalEntry: (text) => mutate((b, t, d) => api.addJournalEntry(b, t, text, d)),
      updateJournalEntry: (id, text) => mutate((b, t, d) => api.updateJournalEntry(b, t, id, text, d)),
      removeJournalEntry: (id) => mutate((b, t, d) => api.removeJournalEntry(b, t, id, d)),
      addLearning: (entry) => mutate((b, t, d) => api.addLearning(b, t, entry, d)),
      removeLearning: (id) => mutate((b, t, d) => api.removeLearning(b, t, id, d)),
      gradeRecall: (id, grade) => mutate((b, t, d) => api.gradeRecall(b, t, id, grade, d)),

      generate: async () => {
        const { serverUrl, apiToken } = get();
        try {
          const state = await api.generate(serverUrl, apiToken, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          set({ status: errorOutcome(e).status });
        }
      },

      saveBook: (currentBook, chapters = 0) =>
        mutate((b, t, d) => api.setBook(b, t, currentBook, chapters, d)),
      logReading: (chapters, label) =>
        mutate((b, t, d) => api.logReading(b, t, chapters, label, d)),
      removeReadingLog: (id) => mutate((b, t, d) => api.removeReadingLog(b, t, id, d)),
      reviewCraftPhase: (done) => mutate((b, t, d) => api.reviewCraftPhase(b, t, done, d)),
      setCraftSource: (source) => mutate((b, t, d) => api.setCraftSource(b, t, source, d)),
      reviewBook: (finished, nextBook) =>
        mutate((b, t, d) => api.reviewBook(b, t, finished, nextBook, d)),
      setInterviewMode: (enabled) => mutate((b, t, d) => api.setInterviewMode(b, t, enabled, d)),

      // Book lookup (Open Library). Search lets errors surface so the picker can
      // show a hint; suggestions are a nicety, so they fail quietly to empty.
      searchBooks: async (q) => {
        const { serverUrl, apiToken } = get();
        return api.searchBooks(serverUrl, apiToken, q);
      },
      suggestBooks: async () => {
        const { serverUrl, apiToken } = get();
        try {
          return await api.suggestBooks(serverUrl, apiToken);
        } catch {
          return [];
        }
      },

      resetAll: () => mutate((b, t, d) => api.reset(b, t, d)),

      // Pure setters — the caller decides when to refresh (so it can await it
      // and show a saving indicator).
      setServerUrl: (url) => set({ serverUrl: url.trim().replace(/\/+$/, '') }),
      setApiToken: (token) => set({ apiToken: token.trim() }),

      dismissNotice: () => set({ notices: get().notices.slice(1) }),
      };
    },
    {
      name: 'arise-client-v2',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // Server owns the game state; the client only remembers its own settings.
      partialize: (s) => ({
        serverUrl: s.serverUrl,
        apiToken: s.apiToken,
      }),
    },
  ),
);
