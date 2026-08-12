"""The free tier's daily allowance, and who is allowed to spend it.

Quest generation runs on every refresh and falls back to the handcrafted pools
without anyone noticing. The nightly distillation runs once and has no fallback:
a day it misses is recall material that never comes to exist. So these tests pin
the two rules that keep that true — generation stops short of the reserve, and a
per-day refusal is learned instead of walked into on every tab.
"""

import urllib.error

import pytest

from app import llm


def _refusal(body: str, code: int = 429) -> urllib.error.HTTPError:
    class _Body:
        """Stands in for the response HTTPError wraps — it reads the body, then
        closes it on cleanup."""

        def __init__(self, raw: bytes):
            self._raw = raw

        def read(self) -> bytes:
            return self._raw

        def close(self) -> None:
            pass

    return urllib.error.HTTPError("https://example.test", code, "Too Many Requests",
                                  {}, _Body(body.encode()))


PER_DAY = ('{"error":{"details":[{"quotaId":'
           '"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}')
PER_MINUTE = ('{"error":{"details":[{"quotaId":'
              '"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}}')


def test_generation_stops_before_it_eats_the_digests_share():
    llm.note_spend(llm.DAILY_LIMIT - llm.DIGEST_RESERVE - 1)
    assert llm.can_generate() is True

    llm.note_spend(1)  # exactly at the reserve now
    assert llm.can_generate() is False
    # The digest still has its reserve to spend.
    assert llm.budget_left() == llm.DIGEST_RESERVE


def test_a_per_day_refusal_closes_the_window_for_everyone():
    llm.note_refusal(_refusal(PER_DAY))
    assert llm.can_generate() is False
    assert llm.budget_left() == 0

    with pytest.raises(RuntimeError, match="quota is spent"):
        llm.distill_learning([{"kind": "book", "source": "DDIA", "text": "notes"}])


def test_a_burst_refusal_does_not_close_the_day():
    """A per-minute limit clears in seconds. Treating it as the daily quota would
    switch the model off for the rest of the day over a few seconds' impatience."""
    llm.note_refusal(_refusal(PER_MINUTE))
    assert llm.can_generate() is True
    assert llm.budget_left() > 0


def test_only_a_429_is_learned_from():
    llm.note_refusal(_refusal(PER_DAY, code=500))
    assert llm.can_generate() is True


def test_the_error_body_survives_being_read_twice():
    """log_failure and note_refusal both want it, and an HTTPError body is a stream
    that empties on the first read."""
    err = _refusal(PER_DAY)
    assert "PerDay" in llm._error_body(err)
    assert "PerDay" in llm._error_body(err)


def test_yesterdays_spending_is_not_carried_forward(monkeypatch):
    monkeypatch.setattr(llm, "quota_day", lambda: "2026-08-11")
    llm.note_spend(llm.DAILY_LIMIT)
    assert llm.budget_left() == 0

    monkeypatch.setattr(llm, "quota_day", lambda: "2026-08-12")
    assert llm.budget_left() == llm.DAILY_LIMIT
