"""A day the model couldn't be reached for is asked about once more.

The scheduled job runs for yesterday and never looks back, so a quota that ran
out at 7am used to mean that day's reading was silently never distilled — no
highlights, and nothing entering the recall rotation. These pin the repair, and
the two things it must not do: spend the day's own allowance, or drag the
running book thread backwards.
"""

from datetime import date, timedelta

from app import digest, llm
from app.models import Highlight, Learning, Player


DAY = "2026-08-12"


def _player(db) -> Player:
    from app import state

    return state.get_or_create_player(db)


def _log(db, player: Player, day: str, source: str = "DDIA ch 1") -> None:
    db.add(Learning(player_id=player.id, day=day, kind="notion", source=source,
                    text="what I took away"))
    db.commit()


def _fake_distiller(monkeypatch, calls: list) -> None:
    """Stand in for the model: records which days it was asked about, and charges
    the budget the way the real call does — that accounting is what stops the loop."""
    def distill(entries, timeout=30.0):
        calls.append(entries)
        llm.note_spend(3)  # one attempt plus its two retries, as distill_learning does
        return {"highlights": [{"text": "an idea worth keeping", "cue": "which idea?"}]}

    monkeypatch.setattr(llm, "distill_learning", distill)
    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(digest, "update_thread", lambda *a, **k: None)


def test_a_day_that_was_never_distilled_is_repaired(db, monkeypatch):
    player = _player(db)
    missed = (date.fromisoformat(DAY) - timedelta(days=2)).isoformat()
    _log(db, player, missed)

    calls: list = []
    _fake_distiller(monkeypatch, calls)

    assert digest.catch_up(db, player, DAY) == [missed]
    assert db.query(Highlight).filter_by(player_id=player.id, day=missed).count() == 1


def test_a_day_already_distilled_is_left_alone(db, monkeypatch):
    player = _player(db)
    past = (date.fromisoformat(DAY) - timedelta(days=1)).isoformat()
    _log(db, player, past)
    db.add(Highlight(player_id=player.id, day=past, text="already kept", box=0, due=""))
    db.commit()

    calls: list = []
    _fake_distiller(monkeypatch, calls)

    assert digest.catch_up(db, player, DAY) == []
    assert calls == []  # nothing was asked of the model


def test_a_day_with_nothing_logged_is_not_a_miss(db, monkeypatch):
    player = _player(db)
    calls: list = []
    _fake_distiller(monkeypatch, calls)

    assert digest.catch_up(db, player, DAY) == []
    assert calls == []


def test_repair_stops_before_it_spends_the_days_own_allowance(db, monkeypatch):
    """Today's distillation matters more than a week ago's, so the repair leaves
    enough on the table for it."""
    player = _player(db)
    for back in range(1, 6):
        _log(db, player, (date.fromisoformat(DAY) - timedelta(days=back)).isoformat())

    calls: list = []
    _fake_distiller(monkeypatch, calls)
    # Only room for one repair before the reserve is reached.
    llm.note_spend(llm.DAILY_LIMIT - digest._TODAY_RESERVE - 1)

    repaired = digest.catch_up(db, player, DAY)
    assert len(repaired) == 1
    assert llm.budget_left() >= 0


def test_repair_works_oldest_first(db, monkeypatch):
    """The thread is stamped with the day it folded in, so a newer day must be
    distilled last or the running summary walks backwards."""
    player = _player(db)
    older = (date.fromisoformat(DAY) - timedelta(days=3)).isoformat()
    newer = (date.fromisoformat(DAY) - timedelta(days=1)).isoformat()
    _log(db, player, newer)
    _log(db, player, older)

    calls: list = []
    _fake_distiller(monkeypatch, calls)

    assert digest.catch_up(db, player, DAY) == [older, newer]
