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
        "kind": row.kind or "motivation",
        "title": row.title,
        "summary": row.summary,
        "takeaways": _loads(row.takeaways),
        "steps": _loads(row.steps),
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


def add_insight(db: Session, player_id: str, url: str, kind: str = "motivation") -> dict:
    """Fetch + distil + persist one capture. `kind` is 'motivation' (quotes + a daily
    nudge) or 'tips' (a practical playbook). Raises:
    - ValueError('no Supadata key') when the transcript service isn't configured
    - NoTranscript when the video has no usable speech to work from
    - any transport/parse error from Supadata or Gemini
    The route maps each of these to a clean HTTP response."""
    kind = "tips" if kind == "tips" else "motivation"
    canonical = transcript.clean_url(url)
    # Idempotent per (url, kind): re-pasting a link under the same mode is a no-op
    # (no wasted Supadata/Gemini calls). The same video can still be kept once as
    # motivation and once as tips, since those distil to different things.
    existing = (
        db.query(Insight)
        .filter_by(player_id=player_id, source_url=canonical, kind=kind)
        .first()
    )
    if existing is not None:
        return to_out(existing)
    fetched = transcript.fetch(url)  # raises ValueError when no key
    text = (fetched.get("text") or "").strip()
    if len(text) < 20:  # nothing meaningful to distil (music-only, silent, etc.)
        raise NoTranscript()
    distilled = llm.distill_tips(text) if kind == "tips" else llm.distill_motivation(text)
    row = Insight(
        player_id=player_id,
        source_url=canonical,
        source=fetched.get("source", "web"),
        kind=kind,
        title=_title_for(url, fetched.get("source", "web")),
        summary=distilled["summary"],
        takeaways=json.dumps(distilled["takeaways"]),
        steps=json.dumps(distilled.get("steps", [])),
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
    """Every quote across motivational captures, tagged with where it came from.
    Tips captures carry no quotes and never feed the Status nudge."""
    out: list[dict] = []
    rows = (
        db.query(Insight)
        .filter_by(player_id=player_id, kind="motivation")
        .order_by(Insight.created_at)
    )
    for r in rows:
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
