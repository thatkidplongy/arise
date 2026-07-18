import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { api, UnauthorizedError, type ApiEvent, type ApiQuest, type ApiState } from '@/lib/api';
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
function noticesFrom(events: ApiEvent[]): Notice[] {
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
function errorOutcome(e: unknown): { status: LinkStatus; notice: Notice } {
  if (e instanceof UnauthorizedError) return { status: 'unauthorized', notice: ACCESS_DENIED() };
  return { status: 'offline', notice: CONNECTION_LOST() };
}

interface SystemStore {
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
  generate: () => Promise<void>;
  toggleRest: () => Promise<void>;
  saveBook: (currentBook: string) => Promise<void>;
  reviewBook: (finished: boolean, nextBook: string) => Promise<void>;
  resetAll: () => Promise<void>;
  setServerUrl: (url: string) => void;
  setApiToken: (token: string) => void;
  dismissNotice: () => void;
}

export const useSystem = create<SystemStore>()(
  persist(
    (set, get) => ({
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
          set({ state, status: 'online', notices: [...notices, ...noticesFrom(events)] });
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
                  id: `t-${Date.now()}-${noticeSeq++}`,
                  title: quest.title,
                  xp: quest.xp,
                  undo: { questId: quest.id, stepIndex },
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
        const { serverUrl, apiToken } = get();
        set({ toast: null });
        try {
          const { state } = await api.toggleStep(
            serverUrl,
            apiToken,
            t.undo.questId,
            t.undo.stepIndex,
            dateKey(),
          );
          set({ state, status: 'online' });
        } catch (e) {
          set({ status: errorOutcome(e).status });
        }
      },

      dismissToast: () => set({ toast: null }),

      saveName: async (name) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.updatePlayer(serverUrl, apiToken, { name }, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      equipTitle: async (title) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.updatePlayer(serverUrl, apiToken, { equipped_title: title }, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      saveNorthStar: async (northStar) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.updatePlayer(serverUrl, apiToken, { north_star: northStar }, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      toggleRest: async () => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.toggleRest(serverUrl, apiToken, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      savePreferences: async (preferences, levels = {}) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.updatePreferences(serverUrl, apiToken, preferences, levels, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      generate: async () => {
        const { serverUrl, apiToken } = get();
        try {
          const state = await api.generate(serverUrl, apiToken, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          set({ status: errorOutcome(e).status });
        }
      },

      saveBook: async (currentBook) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.setBook(serverUrl, apiToken, currentBook, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      reviewBook: async (finished, nextBook) => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.reviewBook(serverUrl, apiToken, finished, nextBook, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      resetAll: async () => {
        const { serverUrl, apiToken, notices } = get();
        try {
          const state = await api.reset(serverUrl, apiToken, dateKey());
          set({ state, status: 'online' });
        } catch (e) {
          const { status, notice } = errorOutcome(e);
          set({ status, notices: [...notices, notice] });
        }
      },

      // Pure setters — the caller decides when to refresh (so it can await it
      // and show a saving indicator).
      setServerUrl: (url) => set({ serverUrl: url.trim().replace(/\/+$/, '') }),
      setApiToken: (token) => set({ apiToken: token.trim() }),

      dismissNotice: () => set({ notices: get().notices.slice(1) }),
    }),
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
