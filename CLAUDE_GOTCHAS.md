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

- **`d-jp` only appears every other day**, on the retention swap in
  `state.active_daily_ids` (coverage areas ride a 4-day wheel instead). Anything that
  paces the Japanese plan by date will fight that rotation; the plan is held at
  `Player.japanese_step` and moves on completion for exactly this reason. Craft's
  wheel seat is mirrored by `quests._SYSTEMS_PHASE` — move one without the other and
  systems reps stop landing on Craft days (a test guards it).

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
