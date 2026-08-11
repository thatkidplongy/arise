"""The Resend transport — request shape and the missing-key contract. Never sends."""

import pytest

from app import mailer, net


def test_disabled_without_a_key(monkeypatch):
    monkeypatch.setenv("ARISE_DIGEST_TO", "me@example.com")
    monkeypatch.delenv("ARISE_RESEND_API_KEY", raising=False)
    assert mailer.enabled() is False


def test_disabled_without_a_recipient(monkeypatch):
    monkeypatch.setenv("ARISE_RESEND_API_KEY", "re_test")
    monkeypatch.delenv("ARISE_DIGEST_TO", raising=False)
    assert mailer.enabled() is False


def test_send_refuses_when_unconfigured():
    with pytest.raises(ValueError):
        mailer.send("subject", "<p>hi</p>", "hi")


def test_send_posts_the_expected_body(monkeypatch):
    monkeypatch.setenv("ARISE_RESEND_API_KEY", "re_test")
    monkeypatch.setenv("ARISE_DIGEST_TO", "me@example.com")
    seen = {}

    def _capture(url, body, headers=None, timeout=20.0, retries=0, backoff=2.0):
        seen.update(url=url, body=body, headers=headers, retries=retries)
        return {"id": "abc"}

    monkeypatch.setattr(net, "post_json", _capture)
    assert mailer.send("Recall", "<p>hi</p>", "hi") == {"id": "abc"}

    assert seen["url"] == mailer._ENDPOINT
    assert seen["body"]["to"] == ["me@example.com"]
    assert seen["body"]["subject"] == "Recall"
    assert seen["body"]["html"] == "<p>hi</p>"
    assert seen["body"]["text"] == "hi"  # a plain-text part travels alongside the HTML
    assert seen["headers"]["authorization"] == "Bearer re_test"
    assert seen["retries"] == 2  # the nightly job can ride out a rate limit


def test_an_inline_attachment_travels_with_the_request(monkeypatch):
    """The profile picture is a part the HTML points at by content id — it has to
    reach Resend under `attachments` or the header renders a broken box."""
    monkeypatch.setenv("ARISE_RESEND_API_KEY", "re_test")
    monkeypatch.setenv("ARISE_DIGEST_TO", "me@example.com")
    seen = {}
    monkeypatch.setattr(net, "post_json",
                        lambda url, body, **k: seen.update(body) or {"id": "x"})

    part = {"filename": "avatar.png", "content": "AAAA", "content_type": "image/png",
            "content_id": "arise-avatar"}
    mailer.send("Recall", '<img src="cid:arise-avatar">', "hi", attachments=[part])
    assert seen["attachments"] == [part]


def test_no_attachments_key_when_there_are_none(monkeypatch):
    """An ordinary send keeps exactly the body it always had."""
    monkeypatch.setenv("ARISE_RESEND_API_KEY", "re_test")
    monkeypatch.setenv("ARISE_DIGEST_TO", "me@example.com")
    seen = {}
    monkeypatch.setattr(net, "post_json",
                        lambda url, body, **k: seen.update(body) or {"id": "x"})

    mailer.send("Recall", "<p>hi</p>", "hi")
    assert "attachments" not in seen


def test_send_names_itself_in_the_user_agent(monkeypatch):
    """Resend is behind Cloudflare, which 403s urllib's default agent (error 1010)
    before the API ever sees the request. Dropping this header breaks every send."""
    monkeypatch.setenv("ARISE_RESEND_API_KEY", "re_test")
    monkeypatch.setenv("ARISE_DIGEST_TO", "me@example.com")
    seen = {}
    monkeypatch.setattr(net, "post_json",
                        lambda url, body, headers=None, **k: seen.update(headers or {}) or {"id": "x"})

    mailer.send("Recall", "<p>hi</p>", "hi")
    assert seen["user-agent"] == "arise/1.0"
    assert "python-urllib" not in seen["user-agent"].lower()


def test_from_defaults_to_the_shared_sender(monkeypatch):
    monkeypatch.setenv("ARISE_RESEND_API_KEY", "re_test")
    monkeypatch.setenv("ARISE_DIGEST_TO", "me@example.com")
    monkeypatch.delenv("ARISE_DIGEST_FROM", raising=False)
    monkeypatch.setattr(net, "post_json", lambda *a, **k: {"id": "x"})
    assert mailer._from_address() == "Arise <onboarding@resend.dev>"


def test_from_can_be_overridden(monkeypatch):
    monkeypatch.setenv("ARISE_DIGEST_FROM", "Arise <recall@mydomain.com>")
    assert mailer._from_address() == "Arise <recall@mydomain.com>"
