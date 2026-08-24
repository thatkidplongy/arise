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

- **`d-jp` only appears every third day**, like every rotating daily (see
  `state.active_daily_ids`). Anything that paces the Japanese plan by date will fight
  that rotation; the plan is held at `Player.japanese_step` and moves on completion
  for exactly this reason.
