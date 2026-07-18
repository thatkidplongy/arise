"""Captured motivational videos → distilled insights (see transcript.py + llm.py).

The Inspire feature: paste a link, we fetch its spoken transcript (Supadata) and
distil it (Gemini) into takeaways + pull-quotes, then store it. One quote
resurfaces on the Status screen each day — a gentle nudge from what you watched,
sitting next to your North Star.

Reads and the single write path both live here (personal scale). `daily_quote`
is a pure derive-on-read: same day → same quote, rotating as the days pass.
"""

import hashlib
import json
import re

from sqlalchemy.orm import Session

from . import llm, transcript
from .models import Insight


class NoTranscript(Exception):
    """The video had no usable spoken words (e.g. music-only, no captions)."""


def _loads(raw: str) -> list[str]:
    try:
        val = json.loads(raw or "[]")
    except (ValueError, TypeError):
        return []
    return [str(x) for x in val] if isinstance(val, list) else []


def _title_for(url: str, source: str) -> str:
    """A short human label for the capture — the @handle when the URL shows one."""
    m = re.search(r"(?:tiktok\.com/|instagram\.com/)(@[\w.\-]+)", url)
    if m:
        return m.group(1)
    return {"tiktok": "TikTok", "instagram": "Instagram", "youtube": "YouTube"}.get(source, "Video")


def to_out(row: Insight) -> dict:
    return {
        "id": row.id,
        "source_url": row.source_url,
        "source": row.source,
        "title": row.title,
        "summary": row.summary,
        "takeaways": _loads(row.takeaways),
        "quotes": _loads(row.quotes),
        "created_at": row.created_at,
    }


def list_insights(db: Session, player_id: str) -> list[dict]:
    rows = (
        db.query(Insight)
        .filter_by(player_id=player_id)
        .order_by(Insight.created_at.desc())
        .all()
    )
    return [to_out(r) for r in rows]


def add_insight(db: Session, player_id: str, url: str) -> dict:
    """Fetch + distil + persist one capture. Raises:
    - ValueError('no Supadata key') when the transcript service isn't configured
    - NoTranscript when the video has no usable speech to work from
    - any transport/parse error from Supadata or Gemini
    The route maps each of these to a clean HTTP response."""
    fetched = transcript.fetch(url)  # raises ValueError when no key
    text = (fetched.get("text") or "").strip()
    if len(text) < 20:  # nothing meaningful to distil (music-only, silent, etc.)
        raise NoTranscript()
    distilled = llm.distill_motivation(text)
    row = Insight(
        player_id=player_id,
        source_url=transcript.clean_url(url),
        source=fetched.get("source", "web"),
        title=_title_for(url, fetched.get("source", "web")),
        summary=distilled["summary"],
        takeaways=json.dumps(distilled["takeaways"]),
        quotes=json.dumps(distilled["quotes"]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_out(row)


def remove_insight(db: Session, player_id: str, insight_id: str) -> None:
    row = db.get(Insight, insight_id)
    if row is not None and row.player_id == player_id:
        db.delete(row)
        db.commit()


def _all_quotes(db: Session, player_id: str) -> list[dict]:
    """Every quote across all captures, tagged with where it came from."""
    out: list[dict] = []
    for r in db.query(Insight).filter_by(player_id=player_id).order_by(Insight.created_at):
        for q in _loads(r.quotes):
            out.append({"text": q, "source_title": r.title, "insight_id": r.id})
    return out


def daily_quote(db: Session, player_id: str, day: str) -> dict | None:
    """One quote to surface on Status, chosen deterministically by the date — stable
    across a day, rotating as days pass. None when nothing's been captured yet."""
    quotes = _all_quotes(db, player_id)
    if not quotes:
        return None
    h = int(hashlib.md5(f"quote:{day}".encode()).hexdigest(), 16)
    return quotes[h % len(quotes)]
