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
  has_avatar: boolean; // true when a profile picture is set (fetch via getAvatar)
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
  notes: { id: string; text: string; step: number | null }[]; // notes jotted this period (via write-steps)
}

/** One quest-linked reflection (from a requires_log quest). */
export interface ApiReflection {
  id: string;
  quest_id: string;
  stat: StatKey;
  prompt: string; // the write-step/question this answers (empty for older notes)
  day: string;
  text: string;
  created_at: string;
}

/** One free-form daily journal entry (unlinked to any quest). */
export interface ApiJournalEntry {
  id: string;
  day: string;
  text: string;
  created_at: string;
  updated_at: string; // last edit (or created_at) — the Journal sorts by this
}

/** One thing you logged reading or learning — the raw capture, before distilling. */
export interface ApiLearning {
  id: string;
  day: string;
  kind: LearningKind;
  source: string; // what it was — title + chapters, a page, a URL
  text: string; // your own notes, optional
  created_at: string;
}

export type LearningKind = 'book' | 'notion' | 'article' | 'work' | 'video' | 'other';

/** An older highlight resurfacing — the spaced half of the Recall digest. */
/**
 * How a recall went, straight from the index-card method: one you knew goes to the
 * back of the pile, one you half-knew to the middle, one you had no clue about near
 * the front. Grading is optional — an ungraded highlight still climbs on its own.
 */
export type RecallGrade = 'got' | 'shaky' | 'missed';

/** The running one-sentence summary of the book you're reading, recondensed each sitting. */
export interface ApiThread {
  title: string;
  summary: string;
  days: number; // sittings folded in so far
}

export interface ApiRecall {
  id: string;
  text: string;
  cue: string; // the question `text` answers — empty on highlights distilled before cues
  hook: string; // a memory aid — empty only on highlights distilled before hooks were on all of them
  day: string; // the day it was learned
  source_label: string;
  days_ago: number;
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
  craft: ApiCraft; // where the system-design plan is, advanced by reading not dates
  reading: ApiReading | null; // progress on the current book, or null when none set
  week_review: ApiWeekReview; // a gentle recap of the current ISO week
  next_rank: { rank: Rank; level: number; streak: number } | null;
  preferences: Partial<Record<StatKey, string[]>>;
  levels: Partial<Record<StatKey, string>>;
  progression: Record<StatKey, ApiProgression>;
  llm_enabled: boolean;
  transcript_enabled: boolean; // true when a Supadata key is set (Inspire capture on)
  digest_enabled: boolean; // true when Resend is configured (the Recall email can send)
  daily_quote: ApiDailyQuote | null; // a rotating pull-quote from captured videos
  quests: ApiQuest[];
  priorities: ApiPriority[]; // self-set focuses pinned on top of the plan, one per attribute
  achievements: ApiAchievement[];
  record: {
    active_days: number;
    total_completions: number;
    xp: number;
    days_cleared: number;
    top_stat: StatKey | null;
  };
  // Personal lists. Open items show on their tab (to-dos on Status, groceries on
  // Body); finished ones move to the You tab's Completed record, dated by *_at.
  reminders: { id: string; text: string; done: boolean; done_at: string | null }[];
  grocery: { id: string; name: string; bought: boolean; bought_at: string | null }[];
  money: ApiMoney; // the money log (in/out) + today/this-week totals, on You
  budget: ApiBudget; // take-home pay + standing commitments, for the 50/30/20 worksheet
  journal: ApiJournalEntry[]; // free-form daily entries, newest first
  reflections: ApiReflection[]; // quest-linked takeaways, newest first
  learnings: ApiLearning[]; // what you logged reading/learning today
  recall: ApiRecall[]; // older highlights coming back around, on an expanding ladder
  thread: ApiThread | null; // the running summary of the book you're reading
}

/** A self-set priority for one attribute, pinned on top of that category's plan. */
export interface ApiPriority {
  stat: StatKey;
  focus: string;
  scope: 'day' | 'week' | 'open';
  title: string;
  note: string;
  steps: string[];
}

/** One line in the money log — an amount in (income) or out (spending). */
export interface ApiMoneyEntry {
  id: string;
  amount: number;
  direction: 'in' | 'out';
  note: string;
  day: string;
  created_at: string;
  bucket: 'needs' | 'wants' | null; // null = untagged spending (or income)
  commitment_id: string | null; // set when logged by paying a standing commitment
}

/** The body POST /money takes. `day` is the day the money actually moved; '' means
 * the day the request itself is for, which is what logging something as it happens
 * wants. Lives here with the other wire types, so the client and the form can't hold
 * two drifting ideas of the same payload. */
export interface ApiMoneyInput {
  amount: number;
  direction: 'in' | 'out';
  note: string;
  bucket: 'needs' | 'wants' | null;
  day: string;
}

/** The money summary in /state — headline figures only; entries come per-period
 * from getMoneyHistory so /state never carries the whole log. */
export interface ApiMoney {
  today_in: number;
  today_out: number;
  week_in: number;
  week_out: number;
  balance: number; // money remaining — all time in minus out
}

export type MoneyScope = 'day' | 'week' | 'month';

export interface ApiMoneyBucket {
  day: string;
  earned: number;
  spent: number;
}

/** One period of the money log (day / week / month) — entries, per-day buckets
 * for the chart, and earned/spent/net totals. */
export interface ApiMoneyHistory {
  scope: MoneyScope;
  start: string;
  end: string;
  earned: number;
  spent: number;
  net: number;
  buckets: ApiMoneyBucket[];
  entries: ApiMoneyEntry[];
}

/** The three shares of the 50/30/20 rule. Only needs and wants can be committed
 * to — savings is whatever income the other two leave behind. */
export type BudgetBucket = 'needs' | 'wants' | 'savings';

/** One standing monthly commitment: a bill you owe, which doubles as a planned
 * line in the worksheet. `variable` marks an allowance (groceries) whose real
 * amount moves month to month, so `amount` is a plan rather than a bill. */
export interface ApiCommitment {
  id: string;
  label: string;
  amount: number;
  bucket: 'needs' | 'wants';
  due_day: number; // day of the month, 0 = no fixed date
  variable: boolean;
  active: boolean; // inactive rows keep their history without counting
  paid_this_month: boolean; // already logged this month, so it's off the due list
}

/** What actually moved this month. `income` is everything that came in (take-home
 * plus any extra) — the figure the 50/30/20 lines divide. `untagged` is spending
 * from before the budget existed — reported as itself, never folded into a bucket
 * it was never assigned to. */
export interface ApiBudgetActual {
  income: number;
  needs: number;
  wants: number;
  untagged: number;
}

/** The budget as stored — raw take-home pay and commitments. Targets, totals and
 * the derived savings figure are computed by readBudget in @/lib/budget, so the
 * worksheet recalculates as you type and the formulas live in exactly one place. */
export interface ApiBudget {
  monthly_income: number; // 0 = not set yet
  start_month: string; // 'YYYY-MM' the budget began, '' before pay is set
  month: string; // the 'YYYY-MM' the actuals below cover
  commitments: ApiCommitment[];
  actual: ApiBudgetActual;
}

/** A recap of the current ISO week, for the "This week" summary. */
export interface ApiWeekReview {
  week: string;
  xp: number;
  completions: number;
  active_days: number;
  days_cleared: number;
  by_stat: Partial<Record<StatKey, number>>;
  top_stat: StatKey | null;
}

/** Where you are in the system-design plan. Advanced by reading, never by a date. */
export interface ApiCraft {
  phase: number;
  phases: number;
  source: string; // the one thing being studied ('' = not picked yet)
  label: string;
  detail: string;
  plan: string[]; // the phase's pieces, in the order you'd take them
  piece: string; // the next uncovered piece ('' once the phase is covered)
  done: number; // pieces ticked off in this phase — what the bar is made of
  studied: number; // notes logged since this phase began: sittings, not pieces
  pieces: number; // how many the phase holds — a denominator, never a deadline
  progress: number; // 0..1
  is_last: boolean;
  pending: boolean; // the phase check-in is due
}

/** One logged sitting of reading — what you read, in your own units. */
export interface ApiReadingLog {
  id: string;
  label: string; // which chapters, verbatim ('' when only a count was given)
  chapters: number;
}

/** Read-only progress on the current book, for the Status screen. */
export interface ApiReading {
  book: string;
  chapters: number; // the book's length; 0 = unknown
  books_finished: number;
  chapters_read: number; // chapters logged since this book began
  days_read: number; // days the reading daily was done since this book began
  progress: number; // 0..1 — chapters_read / chapters; 0 when the length is unknown
  measure: 'chapters' | 'count'; // 'count' = no length set, so no bar to show
  logged_today: ApiReadingLog[];
  done_today: boolean; // something logged today (or the reading daily ticked)
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
  country: string; // "" = worldwide; "PH" = localised food picks
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

/** The fields sent when logging food — a food entry without its server id. */
export type FoodEntry = Omit<ApiFoodEntry, 'id'>;

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

export interface ApiSkincareNote {
  label: string; // e.g. "Niacinamide" / "Fragrance"
  detail: string; // one gentle line on why it's flagged
}

/** A concrete product to buy for a routine step, localised to what's on shelves. */
export interface ApiSkincarePick {
  slot: 'AM' | 'PM';
  step: string;
  brand: string;
  product: string;
  why: string;
}

/** A product looked up in Open Beauty Facts, with a read of its ingredients. */
export interface ApiSkincareProduct {
  name: string;
  brand: string;
  ingredients: string; // raw INCI list (truncated), for the curious
  helpful: ApiSkincareNote[]; // actives that help pigmentation & pores
  watch: ApiSkincareNote[]; // worth knowing if your skin runs sensitive
}

export interface ApiBody {
  day: string;
  profile: ApiBodyProfile | null;
  targets: ApiTargets | null;
  food: ApiFoodDay;
  suggestions: ApiSuggestion[];
  skincare_am: ApiSkincareStep[];
  skincare_pm: ApiSkincareStep[];
  skincare_products: ApiSkincarePick[];
  skincare_resources: string[];
  skincare_note: string;
  skincare_streak: number; // consecutive days a routine block was completed
  skincare_days: number; // total days you've done your routine
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

// ── Quest history (the dated log of finished quests) ─────────────────────────

export interface ApiHistoryItem {
  id: string;
  quest_id: string;
  title: string;
  stat: string; // STR | CRE | SPI | CHA | INT | WLT | CFT ('' if the slug is gone)
  cadence: string; // daily | weekly | side
  xp: number;
  day: string; // client-local 'YYYY-MM-DD'
  at: string; // ISO timestamp
}

// ── Inspire (captured motivational videos → distilled insights) ──────────────

export type InsightKind = 'motivation' | 'tips';

export interface ApiInsight {
  id: string;
  source_url: string;
  source: string; // tiktok | instagram | youtube | web
  kind: InsightKind; // 'motivation' (quotes + daily nudge) or 'tips' (a playbook)
  title: string; // @handle / short label
  summary: string;
  takeaways: string[];
  steps: string[]; // optional actions (tips only; empty for motivation)
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

  setCraftSource: (base: string, token: string, source: string, day: string) =>
    request<ApiState>(base, `/craft/source?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify({ source }),
    }),

  reviewCraftPhase: (base: string, token: string, done: boolean, day: string) =>
    request<ApiState>(base, `/craft/phase?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ done }),
    }),

  finishCraftPiece: (base: string, token: string, done: boolean, day: string) =>
    request<ApiState>(base, `/craft/piece?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ done }),
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

  logReading: (base: string, token: string, chapters: number, label: string, day: string) =>
    request<ApiState>(base, `/reading/log`, token, {
      method: 'POST',
      body: JSON.stringify({ chapters, label, day }),
    }),

  removeReadingLog: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/reading/log/${id}?day=${day}`, token, { method: 'DELETE' }),

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
    request<ApiBody>(base, `/body/state?day=${day}`, token),

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

  logFood: (base: string, token: string, entry: FoodEntry, day: string) =>
    request<ApiBody>(base, `/food/log?day=${day}`, token, { method: 'POST', body: JSON.stringify(entry) }),

  removeFood: (base: string, token: string, entryId: string, day: string) =>
    request<ApiBody>(base, `/food/log/${entryId}?day=${day}`, token, { method: 'DELETE' }),

  searchSkincare: (base: string, token: string, q: string) =>
    request<ApiSkincareProduct[]>(base, `/skincare/search?q=${encodeURIComponent(q)}`, token),

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

  // ── Quest history ─────────────────────────────────────────────────────────
  getHistory: (base: string, token: string) =>
    request<ApiHistoryItem[]>(base, '/history', token),

  // ── Inspire ───────────────────────────────────────────────────────────────
  getInsights: (base: string, token: string) =>
    request<ApiInsight[]>(base, '/insights', token),

  addInsight: (base: string, token: string, url: string, kind: InsightKind = 'motivation') =>
    request<ApiInsight>(
      base,
      '/insights',
      token,
      { method: 'POST', body: JSON.stringify({ url, kind }) },
      60000, // fetch a transcript + distil it — the slowest call in the app
    ),

  removeInsight: (base: string, token: string, insightId: string) =>
    request<ApiInsight[]>(base, `/insights/${insightId}`, token, { method: 'DELETE' }),

  // ── Profile avatar (kept out of /state) ───────────────────────────────────
  getAvatar: (base: string, token: string) =>
    request<{ avatar: string }>(base, '/player/avatar', token),

  // Uploaded via XHR (not fetch) so we can report real upload progress for the
  // ring on the avatar. `onProgress` gets 0..1 as the bytes go up.
  setAvatar: (
    base: string,
    token: string,
    avatar: string,
    onProgress?: (p: number) => void,
  ): Promise<{ avatar: string }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${base}/player/avatar`);
      xhr.setRequestHeader('content-type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 20000; // a base64 image is bigger than a normal call
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ avatar });
          }
        } else {
          reject(new Error(`API ${xhr.status}: ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send(JSON.stringify({ avatar }));
    }),

  // ── Reminders (a simple personal list) ────────────────────────────────────
  addReminder: (base: string, token: string, text: string, day: string) =>
    request<ApiState>(base, `/reminders?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  toggleReminder: (base: string, token: string, id: string, done: boolean, day: string) =>
    request<ApiState>(base, `/reminders/${id}/toggle?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ done }),
    }),

  removeReminder: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/reminders/${id}?day=${day}`, token, { method: 'DELETE' }),

  // ── Grocery list (things to buy) ──────────────────────────────────────────
  addGrocery: (base: string, token: string, name: string, day: string) =>
    request<ApiState>(base, `/grocery?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  toggleGrocery: (base: string, token: string, id: string, bought: boolean, day: string) =>
    request<ApiState>(base, `/grocery/${id}/toggle?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ bought }),
    }),

  removeGrocery: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/grocery/${id}?day=${day}`, token, { method: 'DELETE' }),

  // ── Money log (in/out) ────────────────────────────────────────────────────
  // Two days meet here and they mean different things: `entry.day` is when the money
  // moved, `day` is the screen being looked at and decides which state comes back.
  // Passing the entry whole keeps them from ever being swapped at a call site.
  addMoney: (base: string, token: string, entry: ApiMoneyInput, day: string) =>
    request<ApiState>(base, `/money?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify(entry),
    }),

  removeMoney: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/money/${id}?day=${day}`, token, { method: 'DELETE' }),

  resetMoney: (base: string, token: string, day: string) =>
    request<ApiState>(base, `/money?day=${day}`, token, { method: 'DELETE' }),

  getMoneyHistory: (base: string, token: string, scope: MoneyScope, day: string) =>
    request<ApiMoneyHistory>(base, `/money/history?scope=${scope}&day=${day}`, token),

  // ── Budget (take-home pay + the commitments it's divided across) ──────────
  setIncome: (base: string, token: string, monthlyIncome: number, day: string) =>
    request<ApiState>(base, `/budget/income?day=${day}`, token, {
      method: 'PUT',
      body: JSON.stringify({ monthly_income: monthlyIncome }),
    }),

  addCommitment: (
    base: string, token: string,
    commitment: { label: string; amount: number; bucket: 'needs' | 'wants'; due_day?: number; variable?: boolean },
    day: string,
  ) =>
    request<ApiState>(base, `/budget/commitments?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify(commitment),
    }),

  updateCommitment: (
    base: string, token: string, id: string,
    patch: Partial<{ label: string; amount: number; bucket: 'needs' | 'wants'; due_day: number; variable: boolean; active: boolean }>,
    day: string,
  ) =>
    request<ApiState>(base, `/budget/commitments/${id}?day=${day}`, token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  removeCommitment: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/budget/commitments/${id}?day=${day}`, token, { method: 'DELETE' }),

  /** Log a commitment as paid — writes the money-log entry, tagged, so a bill is
   * never typed twice. `amount` overrides the plan (for variable allowances). */
  payCommitment: (base: string, token: string, id: string, day: string, amount?: number) =>
    request<ApiState>(base, `/budget/commitments/${id}/pay?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ amount: amount ?? null }),
    }),

  // ── Priority (a per-attribute focus pinned on top of the plan) ────────────
  setPriority: (
    base: string, token: string,
    stat: StatKey, focus: string, scope: 'day' | 'week' | 'open', day: string,
  ) =>
    request<ApiState>(base, `/priority?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ stat, focus, scope }),
    }),

  clearPriority: (base: string, token: string, stat: StatKey, day: string) =>
    request<ApiState>(base, `/priority/${stat}?day=${day}`, token, { method: 'DELETE' }),

  // ── Quest journal (reflection notes) ──────────────────────────────────────
  addQuestNote: (
    base: string, token: string, questId: string, text: string, day: string,
    prompt = '', stepIndex: number | null = null,
  ) =>
    request<ApiState>(base, `/quest-notes`, token, {
      method: 'POST',
      body: JSON.stringify({ quest_id: questId, text, prompt, step_index: stepIndex, day }),
    }),

  updateQuestNote: (base: string, token: string, id: string, text: string, day: string) =>
    request<ApiState>(base, `/quest-notes/${id}`, token, {
      method: 'POST',
      body: JSON.stringify({ text, day }),
    }),

  removeQuestNote: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/quest-notes/${id}?day=${day}`, token, { method: 'DELETE' }),

  // ── Journal (free-form daily entries) ─────────────────────────────────────
  addJournalEntry: (base: string, token: string, text: string, day: string) =>
    request<ApiState>(base, `/journal`, token, {
      method: 'POST',
      body: JSON.stringify({ text, day }),
    }),

  updateJournalEntry: (base: string, token: string, id: string, text: string, day: string) =>
    request<ApiState>(base, `/journal/${id}`, token, {
      method: 'POST',
      body: JSON.stringify({ text, day }),
    }),

  removeJournalEntry: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/journal/${id}?day=${day}`, token, { method: 'DELETE' }),

  // ── Recall (what you read/learned → tomorrow's digest email) ──────────────
  addLearning: (
    base: string,
    token: string,
    entry: { kind: LearningKind; source: string; text: string },
    day: string,
  ) =>
    request<ApiState>(base, `/learnings`, token, {
      method: 'POST',
      body: JSON.stringify({ ...entry, day }),
    }),

  removeLearning: (base: string, token: string, id: string, day: string) =>
    request<ApiState>(base, `/learnings/${id}?day=${day}`, token, { method: 'DELETE' }),

  gradeRecall: (base: string, token: string, id: string, grade: RecallGrade, day: string) =>
    request<ApiState>(base, `/recall/${id}/grade?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ grade }),
    }),
};

/** The API surface with the server base + token bound in, so callers pass only
 * the meaningful args (day, ids, payloads). Each method drops its leading
 * `(base, token)`; `day` stays a parameter since it varies per call. */
export type ApiClient = {
  [K in keyof typeof api]: (typeof api)[K] extends (base: string, token: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never;
};

/** Bind `api` to one server + token. Built by mapping over `api` so a new
 * endpoint is picked up automatically — nothing to re-thread here. */
export function createClient(base: string, token: string): ApiClient {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(api) as (keyof typeof api)[]) {
    const fn = api[key] as (...args: unknown[]) => unknown;
    out[key] = (...args: unknown[]) => fn(base, token, ...args);
  }
  return out as ApiClient;
}
