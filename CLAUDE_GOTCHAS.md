# Gotchas

Non-obvious things about this repo, kept short.

- **`scripts/deploy.sh` won't restart the backend for a commit made locally.** Its
  restart check compares the commit before the `git pull` with the one after, so a
  change you committed on this machine has `OLD == NEW` and the backend-changed
  branch never runs — it prints "nothing to do" and keeps serving the old Python.
  (The frontend is fine: that check reads the `dist/.built-from` stamp instead.)
  After a local backend commit, restart it by hand:
  `launchctl kickstart -k "gui/$(id -u)/com.arise.backend"`.

- **A quest with no mandatory floor is capped at two steps** (`quests.cap_steps`).
  If a slot's steps *are* the material rather than variety on top of it, it needs an
  entry in `STEP_CAPS` — otherwise content silently disappears off the card.

- **`d-jp` only appears every third day**, like every rotating daily (see
  `state.active_daily_ids`). Anything that paces the Japanese plan by date will fight
  that rotation; the plan is held at `Player.japanese_step` and moves on completion
  for exactly this reason.
