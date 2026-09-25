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


def test_clean_url_folds_the_host_but_not_the_path():
    """A host is case-insensitive by definition, so two spellings of it are one
    video — and the client's key folds it, so this has to agree or the two
    disagree about what a duplicate is. The path is left alone: these platforms
    put case-sensitive base62 ids in it."""
    assert (transcript.clean_url("https://VT.TikTok.com/ZSabc123/")
            == "https://vt.tiktok.com/ZSabc123/")
    assert (transcript.clean_url("https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ")
            == "https://www.youtube.com/watch?v=dQw4w9WgXcQ")


def test_clean_url_canonicalises_whatever_case_the_host_arrives_in():
    """Folding the host is not enough on its own: an upper-case host has to still
    reach the canonical shape, or it keeps /reels/ and its trailing slash and
    lands as a different video from the same link typed lower-case."""
    assert (transcript.clean_url("https://INSTAGRAM.com/reels/AbC1/")
            == transcript.clean_url("https://instagram.com/reel/AbC1/"))
    assert (transcript.clean_url("https://TikTok.com/@x/video/1?_r=1")
            == transcript.clean_url("https://tiktok.com/@x/video/1"))


def test_clean_url_never_folds_the_path():
    """Its answer is fetched from Supadata, stored, and opened from the card — and
    the ids in these paths are case-sensitive, so folding one would both break the
    link and merge two different videos."""
    assert transcript.clean_url("https://vt.tiktok.com/ZSabc123/") == "https://vt.tiktok.com/ZSabc123/"
    assert (transcript.clean_url("https://instagram.com/reel/AbC1/")
            == "https://instagram.com/reel/AbC1")


def test_clean_url_canonicalises_youtube_to_a_watch_url():
    """YouTube's id is in the query, so this rebuilds rather than trims — the one
    form Supadata is already being handed for every YouTube capture on file."""
    assert (transcript.clean_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            == "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert (transcript.clean_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc")
            == "https://www.youtube.com/watch?v=dQw4w9WgXcQ")


def test_clean_url_reads_every_youtube_spelling_as_one_video():
    """A share sheet emits youtu.be, the address bar emits watch?v=, and a Short
    emits /shorts/ — one video, so one key."""
    watch = transcript.clean_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert transcript.clean_url("https://youtu.be/dQw4w9WgXcQ?si=abc123") == watch
    assert transcript.clean_url("https://www.youtube.com/shorts/dQw4w9WgXcQ") == watch
    assert transcript.clean_url("https://m.youtube.com/watch?v=dQw4w9WgXcQ") == watch
    assert transcript.clean_url("https://YouTu.be/dQw4w9WgXcQ") == watch


def test_clean_url_keeps_the_case_of_a_youtube_id():
    """Eleven case-sensitive characters — dQw4w9WgXcQ and DQW4W9WGXCQ are two
    different videos."""
    a = transcript.clean_url("https://youtu.be/dQw4w9WgXcQ")
    b = transcript.clean_url("https://youtu.be/DqW4W9WGXCq")
    assert a != b
    assert "dQw4w9WgXcQ" in a


def test_clean_url_leaves_a_youtube_link_it_cannot_read_alone():
    """Only an exactly-eleven-character id is a video id. Anything else is a
    channel, a playlist or a typo, and guessing at it would send Supadata
    somewhere the hunter never pasted."""
    for url in ("https://www.youtube.com/@somechannel",
                "https://www.youtube.com/playlist?list=PLabc123"):
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
