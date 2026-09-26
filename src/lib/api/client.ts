/**
 * How the app talks to the server: the two errors it can raise, one `request`
 * that every call goes through, and the endpoint map.
 *
 * Split from the types it carries (see ./types) so that adding an endpoint and
 * adding a schema field stop being edits to the same file.
 */

import type { StatKey } from '@/types';
import type {
  ActionResult,
  ApiBook,
  ApiBookShelf,
  ApiCaptureFailure,
  ApiCaptureSweep,
  ApiHistoryItem,
  ApiInsight,
  ApiMoneyHistory,
  ApiMoneyInput,
  ApiRecall,
  ApiState,
  InsightKind,
  LearningKind,
  MoneyScope,
  RecallGrade,
  StepResult,
  StudySubject,
} from './types';
import type {
  ApiBody,
  ApiBodyProfile,
  ApiFoodEstimate,
  ApiFoodSearchItem,
  ApiSkincareProduct,
  FoodEntry,
} from './body';
// ── Client ───────────────────────────────────────────────────────────────────

/** Thrown for a 401 so the store can show a distinct "access denied" notice. */
export class UnauthorizedError extends Error {}

/** Thrown when the server answered and refused. Carrying the status is what lets a
 * caller tell that apart from never having reached the server at all — which
 * matters for anything the server records on our behalf (see useCaptures). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
      throw new ApiError(res.status, `API ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** How long one capture may take: the server waits up to two minutes on a long
 * video's transcript job, then distils it. */
const CAPTURE_TIMEOUT = 180000;

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

  finishStudyPiece: (
    base: string,
    token: string,
    subject: StudySubject,
    done: boolean,
    day: string,
  ) =>
    request<ApiState>(base, `/study/piece?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ subject, done }),
    }),

  reviewBook: (
    base: string,
    token: string,
    finished: boolean,
    nextBook: string,
    day: string,
  ) =>
    // ActionResult, not ApiState: finishing a book can unlock an achievement, and
    // the events ride back with the state so the notice fires on the same tap.
    request<ActionResult>(base, `/book/review?day=${day}`, token, {
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
      // Fetch a transcript + distil it — the slowest call in the app. A video over
      // ~20 minutes is a job the server waits on before it can distil anything, so
      // a long tutorial needs well past the minute a clip does.
      CAPTURE_TIMEOUT,
    ),

  removeInsight: (base: string, token: string, insightId: string) =>
    request<ApiInsight[]>(base, `/insights/${insightId}`, token, { method: 'DELETE' }),

  getFailedCaptures: (base: string, token: string) =>
    request<ApiCaptureFailure[]>(base, '/insights/failed', token),

  // A retry does the same work a fresh capture does, so it gets the same long
  // window rather than the default 8s.
  retryFailedCapture: (base: string, token: string, failureId: string) =>
    request<ApiInsight>(base, `/insights/failed/${failureId}/retry`, token, { method: 'POST' }, CAPTURE_TIMEOUT),

  // A sweep is several of those back to back (bounded server-side by SWEEP_MAX), so
  // it needs the longest window in the app.
  retryFailedCaptures: (base: string, token: string) =>
    request<ApiCaptureSweep>(base, '/insights/failed/retry', token, { method: 'POST' }, 180000),

  forgetFailedCapture: (base: string, token: string, failureId: string) =>
    request<ApiCaptureFailure[]>(base, `/insights/failed/${failureId}`, token, { method: 'DELETE' }),

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
  /** `on` is the day the bill was really paid, for one remembered late; omit it and
   * the payment lands on `day`, which is what tapping a bill as you pay it wants. */
  payCommitment: (base: string, token: string, id: string, day: string, amount?: number, on?: string) =>
    request<ApiState>(base, `/budget/commitments/${id}/pay?day=${day}`, token, {
      method: 'POST',
      body: JSON.stringify({ amount: amount ?? null, day: on ?? '' }),
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

  getRecallLibrary: (base: string, token: string, day: string) =>
    request<ApiRecall[]>(base, `/recall/library?day=${day}`, token),

  editRecall: (base: string, token: string, id: string, text: string, day: string) =>
    request<ApiState>(base, `/recall/${id}?day=${day}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
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
