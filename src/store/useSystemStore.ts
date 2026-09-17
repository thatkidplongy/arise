import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  createClient,
  UnauthorizedError,
  type ApiBook,
  type ApiBookShelf,
  type ApiClient,
  type ApiEvent,
  type ApiQuest,
  type ApiState,
  type ApiMoneyInput,
  type LearningKind,
  type RecallGrade,
} from '@/lib/api';
import { dateKey } from '@/lib/dates';
import { isQuestDone } from '@/lib/quests';
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
function makeNotice(title: string, lines: string[], celebrate = false): Notice {
  return { id: `n-${Date.now()}-${noticeSeq++}`, title, lines, celebrate };
}

/** Translate server events into System pop-ups. */
export function noticesFrom(events: ApiEvent[]): Notice[] {
  return events.map((e) => {
    switch (e.type) {
      case 'daily_clear':
        return makeNotice(
          'You showed up across the board today',
          ['That’s a full day of showing up — no small thing.', `A little bonus for it: +${e.data.bonus_xp} XP`],
          true,
        );
      case 'level_up':
        return makeNotice('Level up', [`You have reached Level ${e.data.level}.`], true);
      case 'rank_up':
        return makeNotice('Rank up', [`Hunter rank increased: ${e.data.from} → ${e.data.to}.`], true);
      case 'achievement': {
        const lines = [e.data.desc as string];
        if (e.data.title_reward) lines.push(`Title acquired: “${e.data.title_reward}”`);
        return makeNotice(`Achievement · ${e.data.name}`, lines, true);
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
  addMoney: (entry: ApiMoneyInput) => Promise<void>;
  /** `on` back-dates the payment to the day the bill was really settled. */
  payCommitment: (id: string, amount?: number, on?: string) => Promise<void>;
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
  editRecall: (id: string, text: string) => Promise<void>;
  generate: () => Promise<void>;
  toggleRest: () => Promise<void>;
  saveBook: (currentBook: string, chapters?: number) => Promise<void>;
  logReading: (chapters: number, label: string) => Promise<void>;
  removeReadingLog: (id: string) => Promise<void>;
  reviewBook: (finished: boolean, nextBook: string) => Promise<void>;
  reviewCraftPhase: (done: boolean) => Promise<void>;
  finishStudyPiece: (done: boolean) => Promise<void>;
  setCraftSource: (source: string) => Promise<void>;
  setInterviewMode: (enabled: boolean) => Promise<void>;
  searchBooks: (q: string) => Promise<ApiBook[]>;
  suggestBooks: () => Promise<ApiBookShelf[]>;
  resetAll: () => Promise<void>;
  setServerUrl: (url: string) => void;
  setApiToken: (token: string) => void;
  dismissNotice: () => void;
  /** False until the first run has been walked (or skipped) once. */
  onboarded: boolean;
  setOnboarded: (done: boolean) => void;
}

export const useSystemStore = create<SystemStore>()(
  persist(
    (set, get) => {
      // The API with this link's server + token already bound in — the same shape
      // src/query/authed.ts hands its queries, so there is one way to reach the
      // server rather than one per state container. Read fresh each call: the
      // hunter can repoint the link in Settings mid-session.
      const client = (): ApiClient => {
        const { serverUrl, apiToken } = get();
        return createClient(serverUrl, apiToken);
      };

      // Route a failed request to the link status, and — when the hunter asked for
      // it — to a notice. Pass the notices captured before the request, not the
      // ones at failure time, which is what the hand-written actions did. A passive
      // refresh passes none: it's silent, because the ConnectionPanel says it.
      const fail = (e: unknown, notices?: Notice[]): void => {
        const { status, notice } = errorOutcome(e);
        set(notices ? { status, notices: [...notices, notice] } : { status });
      };

      // Shared shape for a mutation that returns fresh state: run it, commit the
      // state, route any error to a user-facing notice.
      const mutate = async (
        fn: (api: ApiClient, day: string) => Promise<ApiState>,
      ): Promise<void> => {
        const { notices } = get();
        try {
          set({ state: await fn(client(), dateKey()), status: 'online' });
        } catch (e) {
          fail(e, notices);
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
        if (!get().state) set({ status: 'connecting' });
        try {
          const fresh = await client().state(dateKey());
          set({ state: fresh, status: 'online' });
          // If the LLM is on, personalise this period in the background — the
          // pool-based board is already showing; it quietly upgrades when ready.
          if (fresh.llm_enabled) void get().generate();
        } catch (e) {
          // Passive refresh is silent — the ConnectionPanel communicates the
          // problem (offline vs unauthorized). No pop-up on load.
          fail(e);
        }
      },

      complete: async (quest) => {
        const { notices } = get();
        if (isQuestDone(quest)) return;
        try {
          const { events, state } = await client().complete(quest.id, dateKey());
          // Tapping the check circle deserves the same floating confirmation as
          // ticking the last step did — without it a save that worked looks like
          // nothing happened. Only once it's actually at target, so a quest that
          // takes several reps isn't told it's complete on the first one.
          const fresh = state.quests.find((q) => q.id === quest.id);
          set({
            state,
            status: 'online',
            notices: [...notices, ...noticesFrom(events)],
            toast: fresh && isQuestDone(fresh)
              ? { id: toastId(), title: quest.title, xp: quest.xp, undo: { kind: 'completion', questId: quest.id } }
              : null,
          });
        } catch (e) {
          fail(e, notices);
        }
      },

      undo: async (quest) => {
        const { notices } = get();
        if (!quest.undoable_id) return;
        try {
          const { state } = await client().undo(quest.undoable_id, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          fail(e, notices);
        }
      },

      toggleStep: async (quest, stepIndex) => {
        const { notices } = get();
        try {
          const { events, state, completed } = await client().toggleStep(quest.id, stepIndex, dateKey());
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
          fail(e, notices);
        }
      },

      undoToast: async () => {
        const t = get().toast;
        if (!t) return;
        const { state } = get();
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
              ? await client().toggleStep(t.undo.questId, t.undo.stepIndex, dateKey())
              : await client().undo(undoableId as string, dateKey());
          set({ state: fresh.state, status: 'online' });
        } catch (e) {
          fail(e);
        }
      },

      dismissToast: () => set({ toast: null }),

      saveName: (name) => mutate((api, d) => api.updatePlayer({ name }, d)),
      equipTitle: (title) => mutate((api, d) => api.updatePlayer({ equipped_title: title }, d)),
      saveNorthStar: (northStar) => mutate((api, d) => api.updatePlayer({ north_star: northStar }, d)),
      toggleRest: () => mutate((api, d) => api.toggleRest(d)),
      savePreferences: (preferences, levels = {}) =>
        mutate((api, d) => api.updatePreferences(preferences, levels, d)),
      addReminder: (text) => mutate((api, d) => api.addReminder(text, d)),
      toggleReminder: (id, done) => mutate((api, d) => api.toggleReminder(id, done, d)),
      removeReminder: (id) => mutate((api, d) => api.removeReminder(id, d)),
      addGrocery: (name) => mutate((api, d) => api.addGrocery(name, d)),
      toggleGrocery: (id, bought) => mutate((api, d) => api.toggleGrocery(id, bought, d)),
      removeGrocery: (id) => mutate((api, d) => api.removeGrocery(id, d)),
      addMoney: (entry) => mutate((api, d) => api.addMoney(entry, d)),
      payCommitment: (id, amount, on) => mutate((api, d) => api.payCommitment(id, d, amount, on)),
      removeMoney: (id) => mutate((api, d) => api.removeMoney(id, d)),
      resetMoney: () => mutate((api, d) => api.resetMoney(d)),
      setIncome: (monthlyIncome) => mutate((api, d) => api.setIncome(monthlyIncome, d)),
      addCommitment: (commitment) => mutate((api, d) => api.addCommitment(commitment, d)),
      updateCommitment: (id, patch) => mutate((api, d) => api.updateCommitment(id, patch, d)),
      removeCommitment: (id) => mutate((api, d) => api.removeCommitment(id, d)),
      setPriority: (stat, focus, scope) => mutate((api, d) => api.setPriority(stat, focus, scope, d)),
      clearPriority: (stat) => mutate((api, d) => api.clearPriority(stat, d)),
      addQuestNote: (questId, text, prompt = '', stepIndex = null) =>
        mutate((api, d) => api.addQuestNote(questId, text, d, prompt, stepIndex)),
      updateQuestNote: (id, text) => mutate((api, d) => api.updateQuestNote(id, text, d)),
      removeQuestNote: (id) => mutate((api, d) => api.removeQuestNote(id, d)),
      addJournalEntry: (text) => mutate((api, d) => api.addJournalEntry(text, d)),
      updateJournalEntry: (id, text) => mutate((api, d) => api.updateJournalEntry(id, text, d)),
      removeJournalEntry: (id) => mutate((api, d) => api.removeJournalEntry(id, d)),
      addLearning: (entry) => mutate((api, d) => api.addLearning(entry, d)),
      removeLearning: (id) => mutate((api, d) => api.removeLearning(id, d)),
      gradeRecall: (id, grade) => mutate((api, d) => api.gradeRecall(id, grade, d)),
      editRecall: (id, text) => mutate((api, d) => api.editRecall(id, text, d)),

      generate: async () => {
        try {
          set({ state: await client().generate(dateKey()), status: 'online' });
        } catch (e) {
          fail(e);
        }
      },

      saveBook: (currentBook, chapters = 0) =>
        mutate((api, d) => api.setBook(currentBook, chapters, d)),
      logReading: (chapters, label) =>
        mutate((api, d) => api.logReading(chapters, label, d)),
      removeReadingLog: (id) => mutate((api, d) => api.removeReadingLog(id, d)),
      reviewCraftPhase: (done) => mutate((api, d) => api.reviewCraftPhase(done, d)),
      finishStudyPiece: (done) => mutate((api, d) => api.finishStudyPiece(done, d)),
      setCraftSource: (source) => mutate((api, d) => api.setCraftSource(source, d)),
      // Not `mutate` like its neighbours: this one answers with events as well as
      // state, because saying you finished a book is what earns the achievement.
      reviewBook: async (finished, nextBook) => {
        const { notices } = get();
        try {
          const { events, state } = await client().reviewBook(finished, nextBook, dateKey());
          set({ state, status: 'online', notices: [...notices, ...noticesFrom(events)] });
        } catch (e) {
          fail(e, notices);
        }
      },
      setInterviewMode: (enabled) => mutate((api, d) => api.setInterviewMode(enabled, d)),

      // Book lookup (Open Library). Search lets errors surface so the picker can
      // show a hint; suggestions are a nicety, so they fail quietly to empty.
      searchBooks: (q) => client().searchBooks(q),
      suggestBooks: async () => {
        try {
          return await client().suggestBooks();
        } catch {
          return [];
        }
      },

      resetAll: () => mutate((api, d) => api.reset(d)),

      // Pure setters — the caller decides when to refresh (so it can await it
      // and show a saving indicator).
      setServerUrl: (url) => set({ serverUrl: url.trim().replace(/\/+$/, '') }),
      setApiToken: (token) => set({ apiToken: token.trim() }),

      onboarded: false,
      setOnboarded: (done) => set({ onboarded: done }),

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
        onboarded: s.onboarded,
      }),
    },
  ),
);
