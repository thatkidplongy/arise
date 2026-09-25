/**
 * The core game state, as the server sends it — a mirror of the request and
 * response models in backend/app/schemas.py.
 *
 * Types live apart from the client that fetches them because they change for
 * different reasons: this file moves when a schema field is added, client.ts
 * moves when an endpoint is. They were one 1127-line file and every edit to
 * either landed in the middle of the other.
 *
 * `@/lib/api` still re-exports everything, so nothing downstream imports from
 * here directly.
 */

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
  band: number; // 0 foundation, 1 building, 2 depth — shown as Shu · Ha · Ri (consts.SHUHARI)
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
  title: string; // the book, without any one day's chapters
  summary: string;
  sittings: number; // times sat with it, counted from the reading log
}

export interface ApiRecall {
  id: string;
  text: string;
  cue: string; // the question `text` answers — empty on highlights distilled before cues
  hook: string; // a memory aid — empty only on highlights distilled before hooks were on all of them
  day: string; // the day it was learned
  source_label: string;
  material: string; // source_label without chapter markers — the per-book pile it files under
  chapter: string; // just the chapter marker, for the card's corner tag
  seen: number; // times actually met — a digest send or a grade, never a plain read
  own_words: boolean; // the answer came from a note the reader wrote, not just a named source
  origin: string; // where the card was born, for the back — empty on derived highlights
  if_missed: number; // days until it returns, per grade — so the buttons can say so
  if_shaky: number;
  if_got: number;
  days_ago: number;
}

export interface ApiAchievement {
  id: string;
  name: string;
  desc: string;
  title_reward: string | null;
  unlocked_at: string | null;
}

/** How much of today's XP counts toward the level (mirrors schemas.BreadthOut). */
export interface ApiBreadth {
  touched: number; // attributes today touched
  of: number; // attributes the board dealt today, plus any others touched
  level_xp: number; // the share of today's XP that counts toward the level
  applies: boolean; // false before the rule began, when every day counted in full
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
    breadth: ApiBreadth;
  };
  book_review: { pending: boolean; book: string };
  craft: ApiCraft; // where the system-design plan is, advanced by reading not dates
  studies: ApiStudy[]; // the study cards Learn shows — one per subject the day deals
  reading: ApiReading | null; // progress on the current book, or null when none set
  week_review: ApiWeekReview; // a gentle recap of the current ISO week
  next_rank: { rank: Rank; level: number; streak: number } | null;
  preferences: Partial<Record<StatKey, string[]>>;
  levels: Partial<Record<StatKey, string>>;
  progression: Record<StatKey, ApiProgression>;
  llm_enabled: boolean;
  craft_parked: boolean; // none of Craft is dealt, so interview mode has nothing to switch
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
  // created_at is the day band the to-do list files an open item under; done_at is
  // what the You tab's Completed record dates a finished one by.
  reminders: { id: string; text: string; done: boolean; created_at: string; done_at: string | null }[];
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
/** Loose spending logged today against each bucket — bills excluded, since a
 * standing bill was planned long before the day it happened to be paid. */
export interface ApiBudgetToday {
  needs: number;
  wants: number;
}

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
  today: ApiBudgetToday;
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

/**
 * A study card Learn shows today, one per subject the board deals: Japanese or
 * drawing every day, taking turns, and system design as well on Mon/Wed/Fri.
 *
 * One shape for three plans that are built differently underneath — Craft is a phase
 * with a source you pick, the other two are positions along a fixed walk — so the app
 * draws one card rather than three that are nearly the same.
 */
export interface ApiStudy extends ApiCraft {
  subject: StudySubject;
  stat: StatKey; // the attribute it feeds — CFT, INT or CRE
  title: string; // what the card calls itself
  unit: string; // what a stretch is called here: 'Phase' or 'Stage'
  steps: string[]; // how to work the open piece (the walks name the exercise; Craft's is a chapter)
  resource: string; // where the step's material lives ('' for Craft — the source is yours)
}

export type StudySubject = 'craft' | 'japanese' | 'sketch';

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

/** Why a capture never became an insight. Only `no_speech` is final — the rest
 * describe something outside the link that can clear (a key, a quota, a service). */
export type CaptureFailReason = 'no_key' | 'no_speech' | 'fetch_failed' | 'distill_failed' | 'failed';

/** A pasted link that didn't distil, kept so it can be tried again later. */
export interface ApiCaptureFailure {
  id: string;
  source_url: string;
  source: string; // tiktok | instagram | youtube | web
  kind: InsightKind;
  title: string; // @handle / short label
  reason: CaptureFailReason;
  detail: string; // the line to show on the card
  attempts: number;
  retryable: boolean; // false only for no_speech — nothing there to distil
  last_tried_at: string;
  created_at: string;
}

/** What one sweep of the kept links managed. `untried` is what the server's own
 * bounds left for next time — reported, so a long list can't look finished. */
export interface ApiCaptureSweep {
  captured: ApiInsight[];
  failed: number;
  untried: number;
  remaining: ApiCaptureFailure[];
}

/** One pull-quote surfaced on Status today, rotating by the date. */
export interface ApiDailyQuote {
  text: string;
  source_title: string;
  insight_id: string;
  /** True when the capture actually said this; false for a distilled takeaway. Only
   * the former may be shown in quotation marks. */
  verbatim: boolean;
}

export interface ApiEvent {
  type: 'daily_clear' | 'level_up' | 'rank_up' | 'achievement' | string;
  // `unknown`, not `any`: the shape differs per event type, and the store reads these
  // fields by name. unknown still interpolates into a template, so the notice copy is
  // unaffected, but it can no longer be silently used as a number or dereferenced.
  data: Record<string, unknown>;
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

