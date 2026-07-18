"""The shared HTTP helper — focused on the 429 retry (no real network)."""

import urllib.error

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


def test_post_json_retries_on_429_then_succeeds(monkeypatch):
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", {}, None)
        return _FakeResp(b'{"ok": true}')

    monkeypatch.setattr(net.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(net.time, "sleep", lambda _s: None)  # don't actually wait

    out = net.post_json("http://example", {"a": 1}, retries=2)
    assert out == {"ok": True}
    assert calls["n"] == 2  # first 429, second succeeded


def test_post_json_does_not_retry_non_429(monkeypatch):
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        calls["n"] += 1
        raise urllib.error.HTTPError(req.full_url, 500, "Server Error", {}, None)

    monkeypatch.setattr(net.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(net.time, "sleep", lambda _s: None)

    try:
        net.post_json("http://example", {"a": 1}, retries=3)
        raised = False
    except urllib.error.HTTPError:
        raised = True
    assert raised and calls["n"] == 1  # a 500 is not retried
