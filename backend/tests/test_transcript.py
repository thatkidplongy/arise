"""Unit tests for the Supadata transcript client (no network)."""

import pytest

from app import transcript


def test_clean_url_canonicalises_tiktok():
    messy = ("https://www.tiktok.com/@justin.sagert/video/7632253916700216590"
             "?_r=1&_d=secabc&share_app_id=1180&utm_source=copy")
    assert (transcript.clean_url(messy)
            == "https://tiktok.com/@justin.sagert/video/7632253916700216590")


def test_clean_url_canonicalises_instagram_reel():
    messy = "https://www.instagram.com/reel/CxYzAbC123/?igsh=abcd&utm_source=ig_web"
    assert transcript.clean_url(messy) == "https://instagram.com/reel/CxYzAbC123"


def test_clean_url_reads_www_and_the_bare_domain_as_one_video():
    """This is the dedup key (insights.capture matches on it), so a host that
    survives means the same video kept twice."""
    assert (transcript.clean_url("https://www.tiktok.com/@x/video/1")
            == transcript.clean_url("https://tiktok.com/@x/video/1"))
    assert (transcript.clean_url("https://www.instagram.com/reel/A1/")
            == transcript.clean_url("https://instagram.com/reel/A1/"))


def test_clean_url_reads_reel_and_reels_as_one_reel():
    """Instagram serves both spellings of the same Reel."""
    assert (transcript.clean_url("https://instagram.com/reel/A1/")
            == transcript.clean_url("https://instagram.com/reels/A1/"))


def test_clean_url_keeps_a_post_apart_from_a_reel():
    assert (transcript.clean_url("https://instagram.com/p/A1/")
            != transcript.clean_url("https://instagram.com/reel/A1/"))


def test_clean_url_never_folds_case():
    """Its answer is fetched from Supadata, stored, and opened from the card — and
    these ids are case-sensitive. Only the client's comparison key may fold the
    host, and even it leaves the path alone."""
    assert transcript.clean_url("https://vt.tiktok.com/ZSabc123/") == "https://vt.tiktok.com/ZSabc123/"
    assert (transcript.clean_url("https://instagram.com/reel/AbC1/")
            == "https://instagram.com/reel/AbC1")


def test_clean_url_leaves_youtube_query_intact():
    # YouTube's id lives in the query string — trimming it would break the link.
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert transcript.clean_url(url) == url


def test_source_of():
    assert transcript.source_of("https://vm.tiktok.com/ZABC/") == "tiktok"
    assert transcript.source_of("https://www.instagram.com/reel/x") == "instagram"
    assert transcript.source_of("https://youtu.be/abc") == "youtube"
    assert transcript.source_of("https://example.com/x") == "web"


def test_parse_joins_segments():
    payload = {"lang": "en", "availableLangs": ["en"], "content": [
        {"text": "Brother,", "duration": 440, "offset": 260},
        {"text": "stay consistent.", "duration": 900, "offset": 700},
    ]}
    out = transcript.parse(payload)
    assert out["lang"] == "en"
    assert out["text"] == "Brother, stay consistent."


def test_parse_handles_plain_text_content():
    out = transcript.parse({"lang": "en", "content": "  just a string  "})
    assert out["text"] == "just a string"


def test_parse_tolerates_missing_content():
    assert transcript.parse({})["text"] == ""


def test_fetch_without_key_raises(monkeypatch):
    monkeypatch.delenv("ARISE_SUPADATA_API_KEY", raising=False)
    assert transcript.enabled() is False
    with pytest.raises(ValueError):
        transcript.fetch("https://www.tiktok.com/@x/video/1")
