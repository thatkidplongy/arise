"""Fetch a video's transcript from its URL via Supadata (TikTok, Reels, Shorts…).

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

from . import net

_ENDPOINT = "https://api.supadata.ai/v1/transcript"

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
    out = parse(payload)
    out["source"] = source_of(target)
    return out
