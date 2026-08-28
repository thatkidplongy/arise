"""Captured motivational videos → distilled insights (see transcript.py + llm.py).

The Inspire feature: paste a link, we fetch its spoken transcript (Supadata) and
distil it (Gemini) into takeaways + pull-quotes, then store it. One quote
resurfaces on the Status screen each day — a gentle nudge from what you watched,
sitting next to your North Star.

Reads and the single write path both live here (personal scale). `daily_quote`
is a pure derive-on-read: same day → same quote, rotating as the days pass.

A capture that doesn't land is written down rather than dropped (`CaptureFailure`,
`note_failure`): most of what stops one is temporary and nothing to do with the
link, so the link is kept and can be distilled later — one at a time, or as a
sweep once the key is in place or the quota has rolled.
"""

import hashlib
import json
import re

from sqlalchemy.orm import Session

from . import llm, transcript
from .models import CaptureFailure, Insight, utcnow


class CaptureError(Exception):
    """A capture that didn't land. Carries the reason it's filed under, the line the
    card shows, and the status the route answers with — so the route stays thin and
    the failure ledger and the HTTP response can't drift apart."""

    reason = "failed"
    status = 502
    message = "Couldn't capture that one — check the link, or try another."

    def __init__(self, message: str = ""):
        self.message = message or type(self).message
        super().__init__(self.message)


class NoKey(CaptureError):
    """The service this needs isn't configured yet. The most retryable failure there
    is: nothing about the link is wrong, a key just isn't set."""

    reason = "no_key"
    status = 503
    message = "Capturing videos needs a Supadata key and a Gemini key on the server."


class NoTranscript(CaptureError):
    """The video had no usable spoken words (e.g. music-only, no captions). The one
    failure a retry can't fix — there is nothing there to distil."""

    reason = "no_speech"
    status = 422
    message = "No speech found in that video — it may be music- or text-only."


class TranscriptFailed(CaptureError):
    """Supadata couldn't be reached, or wouldn't hand over this video's words."""

    reason = "fetch_failed"
    status = 502
    message = "Couldn't fetch that transcript — the service may be busy, or the video private."


class DistillFailed(CaptureError):
    """We had the words; the model call is what fell over — most often the free
    tier's day-quota, which is exactly the case worth retrying tomorrow."""

    reason = "distill_failed"
    status = 502
    message = "Got the words, but distilling them failed — the daily model quota may be spent."


# Every reason but no_speech describes something outside the link that can clear.
RETRYABLE_REASONS = {"no_key", "fetch_failed", "distill_failed", "failed"}

# What one sweep may spend. A retry is a Supadata call plus a Gemini call, and both
# free tiers are small — better to walk a long ledger over a few sweeps than to
# burn the day's allowance on the first tap.
SWEEP_MAX = 5

# Consecutive misses that mean the blocker hasn't actually cleared. Sweeping on
# would just spend the rest of the allowance re-learning the same thing.
SWEEP_GIVE_UP = 2


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
    nudge) or 'tips' (a practical playbook).

    Every way this can fail is a `CaptureError` subclass, so the caller learns which
    stage stopped it (which decides whether retrying is worth an API call) without
    reading exception text. Use `capture` rather than this if the link should be
    remembered when it doesn't land."""
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
    try:
        fetched = transcript.fetch(url)
    except Exception as e:
        raise TranscriptFailed() from e
    text = (fetched.get("text") or "").strip()
    if len(text) < 20:  # nothing meaningful to distil (music-only, silent, etc.)
        raise NoTranscript()
    try:
        distilled = llm.distill_tips(text) if kind == "tips" else llm.distill_motivation(text)
    except Exception as e:
        raise DistillFailed() from e
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


# ── The failure ledger: links kept for a later go ─────────────────────────────


def failure_out(row: CaptureFailure) -> dict:
    return {
        "id": row.id,
        "source_url": row.source_url,
        "source": row.source,
        "kind": row.kind or "motivation",
        "title": row.title,
        "reason": row.reason,
        "detail": row.detail,
        "attempts": row.attempts,
        "retryable": row.reason in RETRYABLE_REASONS,
        "last_tried_at": row.last_tried_at,
        "created_at": row.created_at,
    }


def _failure_rows(db: Session, player_id: str) -> list[CaptureFailure]:
    return (
        db.query(CaptureFailure)
        .filter_by(player_id=player_id)
        .order_by(CaptureFailure.created_at.desc())
        .all()
    )


def list_failures(db: Session, player_id: str) -> list[dict]:
    """Every link still waiting on a distillation, newest first."""
    return [failure_out(r) for r in _failure_rows(db, player_id)]


def _find_failure(db: Session, player_id: str, canonical: str, kind: str) -> CaptureFailure | None:
    return (
        db.query(CaptureFailure)
        .filter_by(player_id=player_id, source_url=canonical, kind=kind)
        .first()
    )


def note_failure(db: Session, player_id: str, url: str, kind: str, err: CaptureError) -> dict:
    """Write a link down, or bump the row it already has. One row per (url, kind), so
    trying the same link four times leaves one entry showing four attempts rather
    than four entries — the ledger is a to-do list, not a log."""
    canonical = transcript.clean_url(url)
    source = transcript.source_of(canonical)
    row = _find_failure(db, player_id, canonical, kind)
    if row is None:
        row = CaptureFailure(
            player_id=player_id,
            source_url=canonical,
            source=source,
            kind=kind,
            title=_title_for(url, source),
            attempts=0,
        )
        db.add(row)
    row.reason = err.reason
    row.detail = err.message
    row.attempts += 1
    row.last_tried_at = utcnow()
    db.commit()
    db.refresh(row)
    return failure_out(row)


def clear_failure(db: Session, player_id: str, url: str, kind: str) -> None:
    """Drop the record — the link finally distilled, so there's nothing to come back
    to. Also how a capture that succeeds by another route tidies up after itself."""
    row = _find_failure(db, player_id, transcript.clean_url(url), kind)
    if row is not None:
        db.delete(row)
        db.commit()


def forget_failure(db: Session, player_id: str, failure_id: str) -> None:
    """Give up on a link by hand (a dead video, a change of mind)."""
    row = db.get(CaptureFailure, failure_id)
    if row is not None and row.player_id == player_id:
        db.delete(row)
        db.commit()


def capture(db: Session, player_id: str, url: str, kind: str = "motivation") -> dict:
    """`add_insight`, with the link remembered when it doesn't land. The single write
    path for a capture — a fresh paste and a retry both come through here, so neither
    can forget to keep (or clear) the ledger entry.

    The key gates sit here rather than in `add_insight` so a retry is held to the
    same bar as a fresh paste, and so a missing key is filed as the retryable thing
    it is instead of vanishing into a 503 the client can only show once."""
    kind = "tips" if kind == "tips" else "motivation"
    try:
        if not transcript.enabled():
            raise NoKey("Capturing videos needs a Supadata key (set ARISE_SUPADATA_API_KEY).")
        if not llm.enabled():
            raise NoKey("Distilling needs a Gemini key (set ARISE_LLM_API_KEY).")
        out = add_insight(db, player_id, url, kind)
    except CaptureError as e:
        note_failure(db, player_id, url, kind, e)
        raise
    clear_failure(db, player_id, url, kind)
    return out


def retry_failure(db: Session, player_id: str, failure_id: str) -> dict:
    """Try one kept link again. Raises LookupError if it isn't in the ledger, or the
    same CaptureError as a fresh paste when it fails again (the row stays, with one
    more attempt on it)."""
    row = db.get(CaptureFailure, failure_id)
    if row is None or row.player_id != player_id:
        raise LookupError(failure_id)
    return capture(db, player_id, row.source_url, row.kind)


def retry_failures(db: Session, player_id: str) -> dict:
    """Sweep the ledger — the "the key's in, try them all" button.

    Least-tried first, so a link that has failed six times can't sit at the front
    eating a sweep the fresher ones needed. `no_speech` rows are skipped rather than
    retried: there was never anything in that video to distil, and spending a call to
    confirm it again is the one retry that can't come good. Bounded twice over
    (SWEEP_MAX, SWEEP_GIVE_UP) because these are two small free tiers; whatever the
    bound left untried is reported, never quietly dropped."""
    rows = [r for r in _failure_rows(db, player_id) if r.reason in RETRYABLE_REASONS]
    rows.sort(key=lambda r: (r.attempts, r.created_at))
    captured: list[dict] = []
    failed = 0
    misses = 0
    tried = 0
    for row in rows:
        if tried >= SWEEP_MAX or misses >= SWEEP_GIVE_UP:
            break
        url, kind = row.source_url, row.kind  # the row may be gone a line from now
        tried += 1
        try:
            captured.append(capture(db, player_id, url, kind))
            misses = 0
        except CaptureError:
            failed += 1
            misses += 1
    return {
        "captured": captured,
        "failed": failed,
        "untried": len(rows) - tried,
        "remaining": list_failures(db, player_id),
    }


def _all_lines(db: Session, player_id: str) -> list[dict]:
    """Every line worth carrying from the motivational captures, tagged with where it
    came from. Tips captures feed nothing here — they distil to a playbook of steps,
    which is a thing to work through rather than a thing to hold onto for a day.

    Both halves of a distillation qualify. A quote is what the video actually said; a
    takeaway is what it was telling you to do, which is just as carryable and there
    are more of them. `verbatim` keeps them distinguishable downstream, because only
    one of the two can honestly be shown inside quotation marks.

    Quotes lead per capture, so the ordering stays stable as before: the same day
    keeps picking the same line rather than shifting when this grew.
    """
    out: list[dict] = []
    rows = (
        db.query(Insight)
        .filter_by(player_id=player_id, kind="motivation")
        .order_by(Insight.created_at)
    )
    for r in rows:
        for q in _loads(r.quotes):
            out.append({"text": q, "source_title": r.title, "insight_id": r.id, "verbatim": True})
        for t in _loads(r.takeaways):
            out.append({"text": t, "source_title": r.title, "insight_id": r.id, "verbatim": False})
    return out


def daily_quote(db: Session, player_id: str, day: str) -> dict | None:
    """One line to surface on Status, chosen deterministically by the date — stable
    across a day, rotating as days pass. None when nothing's been captured yet."""
    lines = _all_lines(db, player_id)
    if not lines:
        return None
    h = int(hashlib.md5(f"quote:{day}".encode()).hexdigest(), 16)
    return lines[h % len(lines)]
