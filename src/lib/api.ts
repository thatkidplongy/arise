import type { Rank, StatKey } from '@/types';

// ── Response shapes (mirror backend/app/schemas.py) ──────────────────────────

export interface ApiPlayer {
  name: string;
  equipped_title: string | null;
  north_star: string;
  created_at: string;
  level: number;
  xp_into: number;
  xp_needed: number;
  total_xp: number;
  rank: Rank;
  current_book: string;
  books_finished: number;
}

export interface ApiStat {
  key: StatKey;
  level: number;
  into: number;
  needed: number;
}

export interface ApiQuest {
  id: string;
  title: string;
  desc: string;
  resource: string; // a trusted place to learn, or '' when there isn't one
  steps: string[];
  steps_done: boolean[];
  stat: StatKey;
  xp: number;
  cadence: 'daily' | 'weekly' | 'side';
  target: number;
  done: number;
  undoable_id: string | null;
}

export interface ApiAchievement {
  id: string;
  name: string;
  desc: string;
  title_reward: string | null;
  unlocked_at: string | null;
}

export interface ApiState {
  player: ApiPlayer;
  stats: ApiStat[];
  streak: { current: number; best: number };
  today: {
    day: string;
    xp: number;
    dailies_done: number;
    dailies_total: number;
    cleared: boolean;
    resting: boolean;
  };
  book_review: { pending: boolean; book: string };
  next_rank: { rank: Rank; level: number; streak: number } | null;
  preferences: Partial<Record<StatKey, string[]>>;
  levels: Partial<Record<StatKey, string>>;
  llm_enabled: boolean;
  quests: ApiQuest[];
  achievements: ApiAchievement[];
  record: { active_days: number; total_completions: number };
}

export interface ApiEvent {
  type: 'daily_clear' | 'level_up' | 'rank_up' | 'achievement' | string;
  data: Record<string, any>;
}

export interface ActionResult {
  events: ApiEvent[];
  state: ApiState;
}

export interface StepResult {
  events: ApiEvent[];
  state: ApiState;
  completed: boolean;
}

// ── Client ───────────────────────────────────────────────────────────────────

/** Thrown for a 401 so the store can show a distinct "access denied" notice. */
export class UnauthorizedError extends Error {}

async function request<T>(
  baseUrl: string,
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (res.status === 401) throw new UnauthorizedError('Invalid or missing API token');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  state: (base: string, token: string, day: string) =>
    request<ApiState>(base, `/state?day=${day}`, token),

  complete: (base: string, token: string, questId: string, day: string) =>
    request<ActionResult>(base, '/completions', token, {
      method: 'POST',
      body: JSON.stringify({ quest_id: questId, day }),
    }),

  undo: (base: string, token: string, completionId: string, day: string) =>
    request<ActionResult>(base, `/completions/${completionId}?day=${day}`, token, {
      method: 'DELETE',
    }),

  toggleStep: (base: string, token: string, questId: string, stepIndex: number, day: string) =>
    request<StepResult>(base, '/steps', token, {
      method: 'POST',
      body: JSON.stringify({ quest_id: questId, step_index: stepIndex, day }),
    }),

  updatePlayer: (
    base: string,
    token: string,
    body: { name?: string; equipped_title?: string | null; north_star?: string },
    day: string,
  ) => request<ApiState>(base, `/player?day=${day}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  toggleRest: (base: string, token: string, day: string) =>
    request<ApiState>(base, `/rest?day=${day}`, token, { method: 'POST' }),

  updatePreferences: (
    base: string,
    token: string,
    preferences: Partial<Record<StatKey, string[]>>,
    levels: Partial<Record<StatKey, string>>,
    day: string,
  ) =>
    request<ApiState>(base, `/preferences?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify({ preferences, levels }),
    }),

  generate: (base: string, token: string, day: string) =>
    request<ApiState>(base, `/quests/generate?day=${day}`, token, { method: 'POST' }),

  setBook: (base: string, token: string, currentBook: string, day: string) =>
    request<ApiState>(base, `/book?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify({ current_book: currentBook }),
    }),

  reviewBook: (
    base: string,
    token: string,
    finished: boolean,
    nextBook: string,
    day: string,
  ) =>
    request<ApiState>(base, `/book/review?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ finished, next_book: nextBook }),
    }),

  reset: (base: string, token: string, day: string) =>
    request<ApiState>(base, `/reset?day=${day}`, token, { method: 'POST' }),
};
