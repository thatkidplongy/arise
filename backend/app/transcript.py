"""Fetch a video's transcript from its URL via Supadata (TikTok, Reels, Shorts…).

Supadata is a hosted transcript API: we send a public video URL and it returns
the spoken transcript as JSON. The free tier is 100 requests/month, no card. The
key lives in ARISE_SUPADATA_API_KEY; with no key, `enabled()` is False and the
"capture a video" feature is simply hidden — like the LLM, it can never break
the rest of the app.

Only stdlib (urllib) is used, so this runs under launchd with no extra deps —
the same contract as llm.py, nutrition.py and books.py.
"""

import json
import os
import re
import urllib.parse
import urllib.request

_ENDPOINT = "https://api.supadata.ai/v1/transcript"

# Canonical shapes we can safely trim to (drops signed share/tracking params that
# bloat the URL). NOT applied to YouTube — its id lives in the query string, so
# stripping the query would break it; those pass through untouched.
_CANONICAL = (
    r"https?://(?:www\.)?tiktok\.com/@[\w.\-]+/video/\d+",
    r"https?://(?:www\.)?instagram\.com/(?:reel|reels|p)/[\w\-]+",
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


def clean_url(url: str) -> str:
    """Trim a pasted share link to its canonical form where it's safe to do so.

    TikTok/Instagram put the id in the path, so we can drop the giant signed
    query string a share button appends. Everything else (incl. YouTube, whose
    id is in the query) is returned as-is apart from whitespace."""
    url = url.strip()
    for pat in _CANONICAL:
        m = re.search(pat, url)
        if m:
            return m.group(0)
    return url


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
    q = urllib.parse.urlencode({"url": target})
    req = urllib.request.Request(
        f"{_ENDPOINT}?{q}",
        headers={"x-api-key": key},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    out = parse(payload)
    out["source"] = source_of(target)
    return out
