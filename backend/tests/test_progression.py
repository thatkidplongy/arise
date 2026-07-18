"""The earned-difficulty engine: weekly settle, ease-down, rest, permanent peak."""

from datetime import date

from app import progression, state
from app.models import Completion, Player


# ── Pure engine ───────────────────────────────────────────────────────────────


def test_required_days_ramps_then_caps():
    # 3 at Lv0, rising to a steady 6 — matches "start at 3, then 4, 5, default 6".
    assert [progression.required_days(l) for l in range(6)] == [3, 4, 5, 6, 6, 6]


def test_band_for():
    assert [progression.band_for(l) for l in range(6)] == [0, 0, 1, 1, 2, 2]


def test_climbs_when_consistent_then_caps():
    # Clear 6 days every week → climb to the cap and hold there.
    weeks = [f"w{i}" for i in range(10)]
    real = {w: 6 for w in weeks}
    level, peak = progression.replay(weeks, real, {}, cap=5)
    assert level == 5 and peak == 5


def test_eases_down_on_an_off_week():
    # Two good weeks up to Lv2, then a week below the bar drops one level.
    weeks = ["w0", "w1", "w2"]
    real = {"w0": 6, "w1": 6, "w2": 0}
    level, peak = progression.replay(weeks, real, {}, cap=5)
    assert level == 1  # 0→1→2, then eased down to 1
    assert peak == 2  # peak is permanent — the high is never erased


def test_full_rest_week_freezes_not_drops():
    # A week of only intentional rest holds the level (no drop, no gain).
    weeks = ["w0", "w1", "w2"]
    real = {"w0": 6, "w1": 6}  # climb to Lv2
    rest = {"w2": 5}  # then a pure rest week
    level, peak = progression.replay(weeks, real, rest, cap=5)
    assert level == 2 and peak == 2


def test_rest_days_count_toward_a_bump():
    # Rest days count as cleared, so real work + rest can clear the bar together.
    level, _ = progression.replay(["w0"], {"w0": 2}, {"w0": 2}, cap=5)
    assert level == 1  # 2 real + 2 rest = 4 ≥ 3


def test_ghost_week_eases_down_but_never_below_zero():
    level, peak = progression.replay(["w0", "w1"], {}, {}, cap=5)
    assert level == 0 and peak == 0


def test_bar_rises_so_five_days_a_week_settles_mid():
    # A steady 5-days-a-week person oscillates around the middle, not the top.
    weeks = [f"w{i}" for i in range(12)]
    real = {w: 5 for w in weeks}
    level, peak = progression.replay(weeks, real, {}, cap=5)
    assert 2 <= level <= 3  # needs 6/wk to pass Lv3 → settles at 2–3
    assert peak == 3


def test_completed_weeks_excludes_current():
    # 2026-07-18 is in W29, so W29 is the in-progress week and isn't settled yet;
    # only the fully-ended W28 counts.
    assert progression.completed_weeks(date(2026, 7, 6), date(2026, 7, 18)) == ["2026-W28"]
    # A day in W30 → both W28 and W29 have ended.
    assert progression.completed_weeks(date(2026, 7, 6), date(2026, 7, 20)) == ["2026-W28", "2026-W29"]


def test_week_start_roundtrips():
    assert progression.week_start("2026-W28") == date(2026, 7, 6)


# ── State integration ─────────────────────────────────────────────────────────


def test_progression_of_levels_up_from_completions(db):
    player = Player(progression_start_week="2026-W28")
    db.add(player)
    db.commit()
    db.refresh(player)
    # Clear the physical daily on 5 days of week W28 (a completed week by 07-13).
    for d in ("2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"):
        db.add(Completion(player_id=player.id, quest_id="d-train", xp=10, day=d))
    db.commit()

    prog = state.progression_of(db, player, "2026-07-13")  # a day in the next week
    assert prog["STR"]["level"] == 1  # 5 ≥ 3 → leveled up
    assert prog["STR"]["peak"] == 1
    assert prog["SPI"]["level"] == 0  # untouched attribute stays at zero
