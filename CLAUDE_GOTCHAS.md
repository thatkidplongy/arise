# Gotchas

Non-obvious things about this repo, kept short.

- **Both of `scripts/deploy.sh`'s stamps must stay gitignored** — `dist/.built-from`
  and `backend/.served-from`. They're how it tells done from outstanding, and it
  rewrites them on almost every run: track either one and the script's own writes
  make the tree dirty, after which it refuses to do anything at all. (`.served-from`
  also sits under `backend/`, so tracking it would make every deploy look like a
  backend change.)

- **A quest with no mandatory floor is capped at two steps** (`quests.cap_steps`).
  If a slot's steps *are* the material rather than variety on top of it, it needs an
  entry in `STEP_CAPS` — otherwise content silently disappears off the card.

- **Craft is a fixed weekly schedule; Japanese and drawing alternate every day**
  (`state._DAILY_ALWAYS` + `_DAILY_BY_WEEKDAY` + `_ALTERNATING`). `d-craft` lands
  Mon/Wed/Fri, the same Monday every Monday. `d-jp` and `d-sketch` take turns by the
  date's ordinal parity — one of them every day, never the same twice running, which
  a weekday table can't do because seven is odd. Folding them back into the weekday
  table puts two of the same walk back to back every Sunday→Monday. Neither
  walk is on every day, so anything that paces the Japanese plan by date will fight
  that; the plan is held at `Player.japanese_step` and moves on completion for
  exactly this reason. On Craft days Learn shows two study cards, and
  `/study/piece` names the subject it moves.
  Sit (`d-meditate`) is out of `_DAILY_ALWAYS` for now, and its progression freezes
  rather than easing down. Spirit's daily is the evening look-back, `d-hansei` — but
  it is deliberately *not* in `progression.DAILY_BY_STAT`: `replay` holds every past
  week to the current schedule, so re-anchoring Spirit on a quest that didn't exist
  before 2026-09-23 would ease its level to zero. `quests.SYSTEMS_WEEKDAY` has the same
  constraint from the other side: it must name a day Craft is actually dealt, or
  the systems-thinking rep silently never happens.

- **Progression asks only for the days the schedule deals.** `_settle_week` caps the
  weekly bar at `state.daily_days_per_week()[stat]`, and freezes a stat whose daily
  is never dealt. Without it, Craft (three weekdays), Creativity (every other day) and Charisma and Wealth (no
  daily at all) would ease down a level every week however faithfully they were
  cleared. Retiring a daily therefore means checking `progression.DAILY_BY_STAT` —
  an anchor pointing at a quest the board never deals rots that attribute to zero.

- **`d-read` has no `POOLS` entry, on purpose.** Grow is one sitting on the hunter's
  own book: the reading floor names it and `_READ_METHODS` varies what you do with
  it, so `content_for` branches before `pool_variant` and the card's chip is the book
  (`reading_resource`), never a `RESOURCES` lookup. It's also skipped in
  `service.generate_quests` for the same reason Craft is — the LLM has never seen
  the book, so anything it writes puts a second source on a one-source card. Adding a
  pool back, or dropping the exclusion, re-splits the card.

- **The Supadata/Gemini key gates live in `insights.capture`, not the `/insights`
  route.** Moving them back to the route (where they were) looks like a tidy-up and
  silently breaks the failure ledger: the route would 503 before `capture` runs, so
  the link is never written to `capture_failures` and a hunter who pasted six things
  while a key was missing loses all six. Same reason a retry goes through `capture`
  rather than calling `add_insight` — that's the only function that both keeps and
  clears a ledger row.

- **A food row carries hands *or* numbers, never both as measurements.** A plate
  logged in portions (`*_p`) has zero calories on it, and `nutrition._entry_parts`
  reads the portions and ignores any kcal on the same row; a packaged food logged
  off its label has zero portions and keeps its printed numbers. Filling in both
  double-counts the same food in the weekly estimate. `food.total_kcal` is
  therefore 0 on a normal day — it sums only the rows that came with real numbers,
  and is not the day's intake.

- **Calories appear on exactly one screen.** Food shows portions; `/trend` shows
  the range. That's not a layout choice — a single day's estimate off bought food
  is out by a few hundred, so the daily figure was removed rather than hidden. Any
  new surface that wants "today's kcal" is asking for a number the app decided not
  to claim.

- **A stored line ending in "…" means it was cut, and the next send will finish it.**
  `llm._clip` marks what it cuts with `llm.CUT`, and `digest.mend_clipped` sends every
  line still carrying that mark to the model to be written out in full (head kept
  verbatim, an ending added). So the ellipsis is a signal, not decoration: never
  append one to stored text any other way, and know that a back edited by hand to end
  in one will be "finished" next morning. Raising a cap only helps new cards — the
  rows written under the old one stay cut until the mend reaches them (the 240-char
  hard cut of August 2026 left 21 backs and 6 hooks that way).

- **A retired daily keeps its `QuestDef` row.** Removing a quest means dropping it
  from `SEED_QUESTS` and from the schedule — never deleting the row, which
  completions, streaks and achievements all key on. The row then exists but is never
  dealt, so `service.generate_quests` skips undealt dailies (otherwise the LLM
  budget is spent writing cards nobody sees) and `quests.pool_variant` falls back to
  the seeded title for any slot with no pool.

- **The look-back reads last night back from its third step.** `d-hansei`'s card
  line gains *Last night's change: "…"* when yesterday's note on step
  `quests.HANSEI_CHANGE_STEP` exists (`state._hansei_echo`). So every lens in
  `HANSEI_LENSES` must keep tomorrow's change as its third step, `STEP_CAPS` must
  keep it at three, and the echo may only change the *desc* — the step-toggle path
  resolves steps without notes, so a step that depended on them would drift.
