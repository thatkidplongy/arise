"""Fetch a video's transcript from its URL via Supadata (TikTok, Reels, Shorts…),
or the text of a web page (a written tutorial) via the same service.

Supadata is a hosted transcript API: we send a public video URL and it returns
the spoken transcript as JSON. The free tier is 100 requests/month, no card. The
key lives in ARISE_SUPADATA_API_KEY; with no key, `enabled()` is False and the
"capture a video" feature is simply hidden — like the LLM, it can never break
the rest of the app.

Network I/O goes through `net`; only the standard library is used, so this runs
under launchd with no extra deps — the same contract as llm.py and books.py.
"""

import os
import re
import time

from . import net

_ENDPOINT = "https://api.supadata.ai/v1/transcript"
# The same service reads a web page back as Markdown — what a written tutorial is
# captured through, since there's nothing to transcribe.
_SCRAPE_ENDPOINT = "https://api.supadata.ai/v1/web/scrape"
# A post's own title and caption. A cooking Reel is often music over the food with
# the whole recipe written underneath, which a transcript can't see.
_METADATA_ENDPOINT = "https://api.supadata.ai/v1/metadata"

# The shapes we can safely rebuild, and what to rebuild them as. Each pattern
# captures the parts that identify the video; the template puts them back without
# whatever the share button wrapped around them.
#
# Rebuilt rather than returned as matched, which is the whole point: the old
# version handed back `m.group(0)`, so an optional `(?:www\.)?` still left the
# www. on when it was there. Since this is the dedup key (see insights.capture),
# that meant www.tiktok.com/... and tiktok.com/... were two different videos.
#
# YouTube used to be excluded, on the grounds that its id is in the query string
# and trimming the query would break the link. True of trimming; this rebuilds,
# so the id survives — and the exclusion was costing a real duplicate, since
# youtu.be/ID from the share sheet and watch?v=ID from the address bar are one
# video and were two rows.
_CANONICAL = (
    (r"https?://(?:www\.)?tiktok\.com/@([\w.\-]+)/video/(\d+)",
     "https://tiktok.com/@{0}/video/{1}"),
    # Instagram serves a Reel at both /reel/ and /reels/; they are one video, so
    # they key as one. A /p/ post is genuinely a different thing and keeps its own.
    (r"https?://(?:www\.)?instagram\.com/reels?/([\w\-]+)",
     "https://instagram.com/reel/{0}"),
    (r"https?://(?:www\.)?instagram\.com/p/([\w\-]+)",
     "https://instagram.com/p/{0}"),
    # Every spelling of a YouTube video: the share sheet's youtu.be, the address
    # bar's watch?v=, a Short, and whichever subdomain it arrived on. The id is
    # exactly eleven characters and the `(?![\w-])` insists on it — a longer run
    # is not an id with a tail, it is something else, and reading eleven
    # characters out of it would send Supadata somewhere nobody pasted.
    #
    # Rebuilt as the full watch URL rather than the shorter youtu.be, because
    # that is the form every YouTube capture on file was already fetched with.
    (r"https?://(?:[\w-]+\.)?youtube\.com/(?:watch\?(?:[^#]*&)?v=|shorts/|embed/)([\w-]{11})(?![\w-])",
     "https://www.youtube.com/watch?v={0}"),
    (r"https?://(?:[\w-]+\.)?youtu\.be/([\w-]{11})(?![\w-])",
     "https://www.youtube.com/watch?v={0}"),
)


def _api_key() -> str:
    return os.environ.get("ARISE_SUPADATA_API_KEY", "")


def enabled() -> bool:
    """True only when a Supadata key is configured. Otherwise the feature hides."""
    return bool(_api_key())


def source_of(url: str) -> str:
    """A coarse platform label from the URL, for display/storage."""
    u = url.lower()
    if "tiktok." in u:
        return "tiktok"
    if "instagram." in u:
        return "instagram"
    if "youtube." in u or "youtu.be" in u:
        return "youtube"
    return "web"


_HOST = re.compile(r"^(https?://[^/?#]+)(.*)$", re.I)


def _fold_host(url: str) -> str:
    """Lower-case the scheme and host, leave everything after them alone.

    A host is case-insensitive by definition — DNS resolves VT.TikTok.com and
    vt.tiktok.com to the same place — so two spellings of it are one video and
    have to key the same way. A path is not case-insensitive, and these platforms
    put case-sensitive base62 ids in theirs, so folding one would both break the
    link and say two different videos were the same one.

    Deliberately the same rule as `foldHost` in src/lib/capture.ts. The client
    decides whether to bother asking and this decides what is actually kept, so
    the two disagreeing about what a duplicate is defeats both."""
    m = _HOST.match(url)
    return m.group(1).lower() + m.group(2) if m else url


def clean_url(url: str) -> str:
    """Rebuild a pasted share link as the one form that names its video.

    Every platform it knows is rebuilt from the parts that identify the video —
    the id, and for TikTok the handle — so the signed query a share button
    appends, the subdomain it came from and the spelling of the path all drop
    away, and every way of writing the same video arrives at the same string.
    A link it doesn't recognise keeps its path and query and gives up only the
    case of its host.

    This is the dedup key (insights.capture matches on it) *and* the URL handed
    to Supadata, stored, and opened from the card — so everything here has to
    leave a working link behind, and the client's `canonical` has to make the
    same judgements or the two disagree about what a duplicate is."""
    url = url.strip()
    for pat, shape in _CANONICAL:
        # Case-insensitive, because folding the host is not enough on its own: an
        # upper-case host that never matches here keeps its /reels/ and its
        # trailing slash, and lands as a different video from the same link typed
        # lower-case. The shapes emit a lower-case host by construction; only the
        # captured id keeps the case it arrived in.
        m = re.search(pat, url, re.I)
        if m:
            return shape.format(*m.groups())
    return _fold_host(url)


def _join(content) -> str:
    """Supadata returns `content` as a list of {text,…} segments (default) or a
    plain string (when text=true). Normalise both to one clean paragraph."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [str(seg.get("text", "")).strip() for seg in content if isinstance(seg, dict)]
        return " ".join(p for p in parts if p).strip()
    return ""


def parse(payload: dict) -> dict:
    """Pure: Supadata JSON → {lang, text}. Testable offline."""
    return {
        "lang": str(payload.get("lang", "") or ""),
        "text": _join(payload.get("content")),
    }


# How long to wait on a video Supadata answers with a job instead of its words.
# Anything over ~20 minutes comes back that way (HTTP 202 + a jobId), which is
# most of a real tutorial. Before this the job's reply was parsed as if it were
# the transcript, found empty, and filed as "no speech" — a long video could
# never be captured, and the ledger said it never would be.
JOB_WAIT = 120.0
_POLL_EVERY = 3.0

# The states a job reports while it's still working. Anything else that isn't
# "completed" is taken as having stopped.
_JOB_WORKING = {"queued", "active", "processing", "pending"}


def _job_result(payload: dict) -> dict:
    """A finished job's transcript. The fields have turned up both at the top
    level and under `result`, so either is read."""
    inner = payload.get("result")
    return inner if isinstance(inner, dict) else payload


def _await_job(job_id: str, key: str, timeout: float, wait: float = JOB_WAIT,
               sleep=time.sleep, clock=time.monotonic) -> dict:
    """Poll a transcript job until it lands → the finished payload.

    Raises ValueError if the job fails or is still going when `wait` runs out —
    both are the retryable fetch_failed, which is right: a job that timed out
    here has usually finished by the time the ledger tries it again."""
    deadline = clock() + wait
    while True:
        payload = net.get_json(f"{_ENDPOINT}/{job_id}", headers={"x-api-key": key}, timeout=timeout)
        status = str(payload.get("status", "")).lower()
        if status == "completed":
            return _job_result(payload)
        if status not in _JOB_WORKING:
            raise ValueError(f"transcript job {status or 'broke'}: {payload.get('error', '')}")
        if clock() + _POLL_EVERY > deadline:
            raise ValueError("transcript job still running")
        sleep(_POLL_EVERY)


def fetch(url: str, timeout: float = 30.0) -> dict:
    """Fetch a transcript for a public video URL → {lang, text, source}.

    Raises ValueError when no key is set, or on any transport/HTTP/parse error;
    the route turns that into a clean message. Only called on demand (when the
    user pastes a link), never in the background."""
    key = _api_key()
    if not key:
        raise ValueError("no Supadata key")
    target = clean_url(url)
    payload = net.get_json(_ENDPOINT, params={"url": target}, headers={"x-api-key": key}, timeout=timeout)
    if payload.get("jobId"):
        payload = _await_job(str(payload["jobId"]), key, timeout)
    out = parse(payload)
    out["source"] = source_of(target)
    return out


def parse_metadata(payload: dict) -> dict:
    """Pure: Supadata's metadata JSON → {title, caption}. Either may be ''."""
    return {
        "title": " ".join(str(payload.get("title", "") or "").split()),
        "caption": str(payload.get("description", "") or "").strip(),
    }


def metadata(url: str, timeout: float = 15.0) -> dict:
    """A video post's title and caption → {title, caption}. Same contract as
    `fetch`: ValueError without a key, and any other error propagates."""
    key = _api_key()
    if not key:
        raise ValueError("no Supadata key")
    payload = net.get_json(_METADATA_ENDPOINT, params={"url": clean_url(url)},
                           headers={"x-api-key": key}, timeout=timeout)
    return parse_metadata(payload)


def is_video(url: str) -> bool:
    """Whether a link is one of the video platforms, as opposed to a page to read."""
    return source_of(url) != "web"


def parse_page(payload: dict) -> dict:
    """Pure: Supadata's web-scrape JSON → {title, text}. Testable offline."""
    return {
        "title": " ".join(str(payload.get("name", "") or "").split()),
        "text": str(payload.get("content", "") or "").strip(),
    }


def scrape(url: str, timeout: float = 30.0) -> dict:
    """Read a web page (an article, a docs page, a written tutorial) → {title, text,
    source}, the text as Markdown with the links stripped.

    Same key and the same contract as `fetch`: ValueError without a key, and any
    transport/HTTP/parse error propagates for the caller to name."""
    key = _api_key()
    if not key:
        raise ValueError("no Supadata key")
    target = clean_url(url)
    payload = net.get_json(_SCRAPE_ENDPOINT, params={"url": target, "noLinks": "true"},
                           headers={"x-api-key": key}, timeout=timeout)
    out = parse_page(payload)
    out["source"] = "web"
    return out
