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


# ── Long videos (a job to poll) and pages (a scrape) ─────────────────────────


def _fake_net(monkeypatch, replies):
    """Stand in for net.get_json: each call takes the next reply and records what
    was asked for."""
    calls = []

    def get_json(url, params=None, headers=None, timeout=8.0):
        calls.append((url, params))
        return replies.pop(0)

    monkeypatch.setattr(transcript.net, "get_json", get_json)
    monkeypatch.setattr(transcript, "_api_key", lambda: "k")
    return calls


def test_fetch_waits_out_a_long_videos_job(monkeypatch):
    """Over ~20 minutes Supadata answers with a jobId, not the words. Reading that
    reply as the transcript found it empty and called a long video silent."""
    calls = _fake_net(monkeypatch, [
        {"jobId": "j1"},
        {"status": "active"},
        {"status": "completed", "content": [{"text": "First,"}, {"text": "install it."}], "lang": "en"},
    ])
    monkeypatch.setattr(transcript.time, "sleep", lambda s: None)
    out = transcript.fetch("https://youtu.be/dQw4w9WgXcQ")
    assert out["text"] == "First, install it."
    assert out["source"] == "youtube"
    assert [c[0] for c in calls[1:]] == [f"{transcript._ENDPOINT}/j1"] * 2


def test_a_finished_job_is_read_under_result_too():
    assert transcript._job_result({"status": "completed", "result": {"content": "hi"}}) == {"content": "hi"}
    assert transcript._job_result({"status": "completed", "content": "hi"})["content"] == "hi"


def test_a_failed_job_raises(monkeypatch):
    _fake_net(monkeypatch, [{"jobId": "j1"}, {"status": "failed", "error": "private video"}])
    with pytest.raises(ValueError, match="failed"):
        transcript.fetch("https://youtu.be/dQw4w9WgXcQ")


def test_a_job_that_outlasts_the_wait_raises_rather_than_spinning(monkeypatch):
    now = [0.0]

    def sleep(s):
        now[0] += s

    _fake_net(monkeypatch, [{"status": "active"}] * 100)
    with pytest.raises(ValueError, match="still running"):
        transcript._await_job("j1", "k", timeout=5, wait=10, sleep=sleep, clock=lambda: now[0])


def test_scrape_reads_a_page_as_text_without_links(monkeypatch):
    calls = _fake_net(monkeypatch, [{"name": "  Set up  Postgres ", "content": "# Install\n\nRun brew.\n"}])
    out = transcript.scrape("https://Example.com/guides/postgres?ref=hn")
    assert out == {"title": "Set up Postgres", "text": "# Install\n\nRun brew.", "source": "web"}
    url, params = calls[0]
    assert url == transcript._SCRAPE_ENDPOINT
    assert params == {"url": "https://example.com/guides/postgres?ref=hn", "noLinks": "true"}


def test_scrape_needs_the_key(monkeypatch):
    monkeypatch.setattr(transcript, "_api_key", lambda: "")
    with pytest.raises(ValueError):
        transcript.scrape("https://example.com/a")


def test_is_video_tells_a_page_from_a_platform():
    assert transcript.is_video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert transcript.is_video("https://tiktok.com/@x/video/1")
    assert not transcript.is_video("https://fastapi.tiangolo.com/tutorial/")


def test_metadata_reads_a_posts_title_and_caption(monkeypatch):
    calls = _fake_net(monkeypatch, [{
        "title": "  Garlic  butter salmon ", "description": "Ingredients:\n2 salmon fillets\n",
        "author": {"username": "chef"}}])
    out = transcript.metadata("https://www.tiktok.com/@chef/video/1?_r=1")
    assert out == {"title": "Garlic butter salmon", "caption": "Ingredients:\n2 salmon fillets"}
    assert calls[0] == (transcript._METADATA_ENDPOINT, {"url": "https://tiktok.com/@chef/video/1"})


def test_metadata_reads_a_missing_caption_as_empty():
    assert transcript.parse_metadata({"title": None, "description": None}) == {"title": "", "caption": ""}
