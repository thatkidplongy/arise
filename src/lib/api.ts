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
  current_book_chapters: number;
  books_finished: number;
  interview_mode: boolean;
}

export interface ApiStat {
  key: StatKey;
  level: number;
  into: number;
  needed: number;
}

/** Earned difficulty for one attribute (mirrors schemas.ProgressionOut). */
export interface ApiProgression {
  level: number; // current difficulty tier
  peak: number; // highest tier ever reached — permanent
  cap: number; // the ceiling tier
  required: number; // days to clear this week to level up
  cleared_this_week: number; // days cleared so far this week
  band: number; // 0 foundation, 1 building, 2 depth
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
  progression: Record<StatKey, ApiProgression>;
  llm_enabled: boolean;
  transcript_enabled: boolean; // true when a Supadata key is set (Inspire capture on)
  daily_quote: ApiDailyQuote | null; // a rotating pull-quote from captured videos
  quests: ApiQuest[];
  achievements: ApiAchievement[];
  record: { active_days: number; total_completions: number };
}

// ── Body (standalone wellness tools) ─────────────────────────────────────────

export interface ApiBodyProfile {
  sex: string; // male | female | unspecified
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: string; // sedentary | light | moderate | active | very_active
  goal: string; // maintain | gentle_loss | gentle_gain (fallback when no goal weight)
  goal_weight_kg: number; // 0 = not set
}

export interface ApiTargets {
  bmr: number;
  tdee: number;
  target: number;
  target_low: number;
  target_high: number;
  protein_g: number;
  fibre_g: number;
  bmi: number;
  bmi_category: string; // underweight | healthy | overweight | obese
  healthy_low: number;
  healthy_high: number;
  goal_weight: number; // 0 when not set
}

export interface ApiFoodEntry {
  id: string;
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  fibre_g: number;
}

export interface ApiFoodDay {
  entries: ApiFoodEntry[];
  total_kcal: number;
  total_protein: number;
  total_fibre: number;
}

export interface ApiFoodSearchItem {
  name: string;
  brand: string;
  kcal_100g: number;
  protein_100g: number;
  fibre_100g: number;
  serving_size: string;
}

export interface ApiSuggestion {
  name: string;
  serving: string;
  kcal: number;
  protein_g: number;
  fibre_g: number;
  tag: 'protein' | 'fibre' | 'meal';
}

/** An AI estimate from a food photo — the user edits it before logging. */
export interface ApiFoodEstimate {
  name: string;
  kcal: number;
  protein_g: number;
  fibre_g: number;
  note: string;
  source: string; // 'label' (read off a nutrition panel), 'food', 'none', or ''
}

export interface ApiSkincareStep {
  id: string;
  routine: 'AM' | 'PM';
  text: string;
  done: boolean;
}

export interface ApiBody {
  day: string;
  profile: ApiBodyProfile | null;
  targets: ApiTargets | null;
  food: ApiFoodDay;
  suggestions: ApiSuggestion[];
  skincare_am: ApiSkincareStep[];
  skincare_pm: ApiSkincareStep[];
  skincare_resources: string[];
  skincare_note: string;
}

// ── Books (Open Library) ─────────────────────────────────────────────────────

export interface ApiBook {
  title: string;
  author: string;
  pages: number; // 0 if unknown
  cover_url: string; // '' if none
  year: number; // 0 if unknown
}

export interface ApiBookShelf {
  label: string;
  books: ApiBook[];
}

// ── Inspire (captured motivational videos → distilled insights) ──────────────

export interface ApiInsight {
  id: string;
  source_url: string;
  source: string; // tiktok | instagram | youtube | web
  title: string; // @handle / short label
  summary: string;
  takeaways: string[];
  quotes: string[];
  created_at: string;
}

/** One pull-quote surfaced on Status today, rotating by the date. */
export interface ApiDailyQuote {
  text: string;
  source_title: string;
  insight_id: string;
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
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

  setBook: (base: string, token: string, currentBook: string, chapters: number, day: string) =>
    request<ApiState>(base, `/book?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify({ current_book: currentBook, chapters }),
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

  searchBooks: (base: string, token: string, q: string) =>
    request<ApiBook[]>(base, `/books/search?q=${encodeURIComponent(q)}`, token),

  suggestBooks: (base: string, token: string) =>
    request<ApiBookShelf[]>(base, `/books/suggest`, token),

  setInterviewMode: (base: string, token: string, enabled: boolean, day: string) =>
    request<ApiState>(base, `/interview?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),

  reset: (base: string, token: string, day: string) =>
    request<ApiState>(base, `/reset?day=${day}`, token, { method: 'POST' }),

  // ── Body ────────────────────────────────────────────────────────────────────
  getBody: (base: string, token: string, day: string) =>
    request<ApiBody>(base, `/body?day=${day}`, token),

  setBodyProfile: (base: string, token: string, profile: ApiBodyProfile, day: string) =>
    request<ApiBody>(base, `/body/profile?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify(profile),
    }),

  searchFood: (base: string, token: string, q: string) =>
    request<ApiFoodSearchItem[]>(base, `/food/search?q=${encodeURIComponent(q)}`, token),

  analyzeFood: (base: string, token: string, image: string, mime: string) =>
    request<ApiFoodEstimate>(
      base,
      '/food/analyze',
      token,
      { method: 'POST', body: JSON.stringify({ image, mime }) },
      30000, // vision is slower than the usual call
    ),

  logFood: (
    base: string,
    token: string,
    entry: { name: string; grams: number; kcal: number; protein_g: number; fibre_g: number },
    day: string,
  ) => request<ApiBody>(base, `/food/log?day=${day}`, token, { method: 'POST', body: JSON.stringify(entry) }),

  removeFood: (base: string, token: string, entryId: string, day: string) =>
    request<ApiBody>(base, `/food/log/${entryId}?day=${day}`, token, { method: 'DELETE' }),

  addSkincareStep: (base: string, token: string, routine: 'AM' | 'PM', text: string, day: string) =>
    request<ApiBody>(base, `/skincare/step?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ routine, text }),
    }),

  removeSkincareStep: (base: string, token: string, stepId: string, day: string) =>
    request<ApiBody>(base, `/skincare/step/${stepId}?day=${day}`, token, { method: 'DELETE' }),

  checkSkincare: (base: string, token: string, stepId: string, done: boolean, day: string) =>
    request<ApiBody>(base, `/skincare/check?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ step_id: stepId, done }),
    }),

  // ── Inspire ───────────────────────────────────────────────────────────────
  getInsights: (base: string, token: string) =>
    request<ApiInsight[]>(base, '/insights', token),

  addInsight: (base: string, token: string, url: string) =>
    request<ApiInsight>(
      base,
      '/insights',
      token,
      { method: 'POST', body: JSON.stringify({ url }) },
      60000, // fetch a transcript + distil it — the slowest call in the app
    ),

  removeInsight: (base: string, token: string, insightId: string) =>
    request<ApiInsight[]>(base, `/insights/${insightId}`, token, { method: 'DELETE' }),
};
