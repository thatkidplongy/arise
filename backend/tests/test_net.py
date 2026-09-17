"""The shared HTTP helper — which answers it tries again on (no real network).

A 429 or a 5xx says "not now": the request did nothing, and a short wait usually
clears it. A 4xx says "no", so it isn't retried — a bad request won't get better,
and the mailer retries too, where a second email is worse than a late one.
"""

import urllib.error

import pytest

from app import net


class _FakeResp:
    def __init__(self, body: bytes):
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self._body


def _urlopen_that(monkeypatch, codes: list[int]):
    """Fail the first len(codes) calls with those HTTP statuses, then succeed."""
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        calls["n"] += 1
        if calls["n"] <= len(codes):
            code = codes[calls["n"] - 1]
            raise urllib.error.HTTPError(req.full_url, code, "err", {}, None)
        return _FakeResp(b'{"ok": true}')

    monkeypatch.setattr(net.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(net.time, "sleep", lambda _s: None)  # don't actually wait
    return calls


def test_post_json_retries_on_429_then_succeeds(monkeypatch):
    calls = _urlopen_that(monkeypatch, [429])
    out = net.post_json("http://example", {"a": 1}, retries=2)
    assert out == {"ok": True}
    assert calls["n"] == 2  # first 429, second succeeded


@pytest.mark.parametrize("code", [500, 502, 503])
def test_post_json_retries_a_server_failure_too(monkeypatch, code):
    """Gemini's free tier answers 503 "overloaded" often enough that one attempt
    lost a whole morning's distillation; the request did nothing, so ask again."""
    calls = _urlopen_that(monkeypatch, [code])
    assert net.post_json("http://example", {"a": 1}, retries=2) == {"ok": True}
    assert calls["n"] == 2


def test_post_json_does_not_retry_a_rejected_request(monkeypatch):
    calls = _urlopen_that(monkeypatch, [400, 400, 400])
    with pytest.raises(urllib.error.HTTPError):
        net.post_json("http://example", {"a": 1}, retries=3)
    assert calls["n"] == 1  # a 4xx is not retried


def test_post_json_gives_up_after_its_retries(monkeypatch):
    calls = _urlopen_that(monkeypatch, [503, 503, 503, 503])
    with pytest.raises(urllib.error.HTTPError):
        net.post_json("http://example", {"a": 1}, retries=2)
    assert calls["n"] == 3  # one attempt plus its two retries


def test_post_json_without_retries_asks_once(monkeypatch):
    calls = _urlopen_that(monkeypatch, [503])
    with pytest.raises(urllib.error.HTTPError):
        net.post_json("http://example", {"a": 1})
    assert calls["n"] == 1
