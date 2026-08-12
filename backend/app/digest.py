"""Recall: yesterday's learning, turned into questions and emailed back each morning.

Reading a lot and remembering little is the problem this solves. Each day's
learnings (see models.Learning) are distilled once by the LLM into a handful of
keepable lines — Highlights — each carrying the question it answers.

The email asks before it tells. Cues come first, answers sit well below them, and
the picks span an expanding ladder of past days. Three things drive that shape:

* **Retrieval, not review.** Being asked and briefly failing fixes a memory;
  re-reading a line you recognise mostly produces the feeling of knowing it.
* **Expanding intervals.** Forgetting is steepest early, so the rungs start close
  and stretch (RECALL_INTERVALS).
* **The 24-hour window.** Yesterday's material is asked first, because that's the
  last moment the surrounding detail can still be dredged up and written down —
  hence FLESH_NUDGE at the foot of every email.

Mnemonic hooks are generated only for arbitrary material (see llm._LEARNING_PROMPT);
for anything re-derivable they're clutter competing with the understanding.

Reads and the single write path both live here, like insights.py. `recall_set` is
a pure derive-on-read — same day, same picks, rotating as the days pass.
"""

import re
import sys
from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import llm, mailer, recap
from .models import (Completion, DigestRun, Highlight, Learning, Player, QuestNote,
                     ReadingLog, Thread)

READING_QUEST_ID = "d-read"

# An expanding ladder, not evenly spaced: forgetting is steepest in the first days,
# so the early touches sit close together and later ones stretch out. Each rung is
# roughly twice the last.
RECALL_INTERVALS = (1, 3, 7, 16, 35)
# Five questions is a few minutes of real effort; ten is homework, and homework is
# what stops getting done. A backlog waits its turn rather than arriving at once.
PER_DIGEST = 5


def to_out(row: Learning) -> dict:
    return {
        "id": row.id,
        "day": row.day,
        "kind": row.kind,
        "source": row.source,
        "text": row.text,
        "created_at": row.created_at,
    }


def list_learnings(db: Session, player_id: str, day: str) -> list[dict]:
    rows = (
        db.query(Learning)
        .filter_by(player_id=player_id, day=day)
        .order_by(Learning.created_at)
        .all()
    )
    return [to_out(r) for r in rows]


def add_learning(db: Session, player_id: str, day: str, kind: str, source: str, text: str) -> dict:
    row = Learning(
        player_id=player_id, day=day, kind=kind, source=source.strip(), text=text.strip()
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_out(row)


def remove_learning(db: Session, player_id: str, learning_id: str) -> None:
    row = db.get(Learning, learning_id)
    if row is not None and row.player_id == player_id:
        db.delete(row)
        db.commit()


# ── Building a day's highlights ──────────────────────────────────────────────


def gather(db: Session, player: Player, day: str) -> list[dict]:
    """Everything the hunter learned on `day`, from every surface that records it:
    what they logged, what they wrote to finish a reflective quest, and — only when
    they logged no book themselves — the chapters recorded in the reading log."""
    entries = [
        {"kind": r.kind, "source": r.source, "text": r.text}
        for r in db.query(Learning).filter_by(player_id=player.id, day=day).order_by(Learning.created_at)
    ]

    for note in (
        db.query(QuestNote)
        .filter_by(player_id=player.id, day=day)
        .order_by(QuestNote.created_at)
    ):
        # The prompt is useful context for the distiller (it's the question being
        # answered) but it's a paragraph, not a name — so it rides in the text and
        # never becomes an attribution label.
        body = f"(answering: {note.prompt})\n{note.text}" if note.prompt else note.text
        entries.append({"kind": "reflection", "source": "", "text": body})

    # What they read today, from the reading log — real chapter numbers, so the
    # distiller can be specific. Skipped when they already logged the book on the
    # Learn screen, where they'd have written actual notes.
    logged_a_book = any(e["kind"] == "book" for e in entries)
    if player.current_book and not logged_a_book:
        chapters = _chapters_today(db, player, day)
        if chapters:
            entries.append({
                "kind": "book",
                "source": f"{player.current_book}, ch {chapters}",
                "text": f"Read chapters {chapters} — no notes were taken, so stay close to the source.",
            })
        elif _read_today(db, player, day):
            # The daily ticked with nothing logged: worth including as a weak signal,
            # but there's no telling which chapters, so it can't be specific.
            entries.append({
                "kind": "book",
                "source": player.current_book,
                "text": "Read today's chapters (which ones wasn't recorded, so stay general).",
            })

    return entries


def _chapters_today(db: Session, player: Player, day: str) -> str:
    """Which chapters were logged today, as the hunter labelled them ('5–7, 8'), or
    '' when nothing was logged. Sittings with only a count contribute nothing to
    name, so they're left out of the label rather than guessed at."""
    rows = (
        db.query(ReadingLog)
        .filter_by(player_id=player.id, book=player.current_book, day=day)
        .order_by(ReadingLog.created_at)
    )
    return ", ".join(r.label.strip() for r in rows if r.label.strip())


def _read_today(db: Session, player: Player, day: str) -> bool:
    return (
        db.query(Completion)
        .filter_by(player_id=player.id, quest_id=READING_QUEST_ID, day=day)
        .first()
        is not None
    )


# Kinds whose `source` is an actual name you'd want to see under a highlight.
# Reflections are excluded: their text is yours, with no source to credit.
_NAMED_KINDS = {"book", "notion", "article", "video", "work"}

MAX_LABEL_SOURCES = 2
MAX_SOURCE_CHARS = 60


def source_label(entries: list[dict]) -> str:
    """A short line crediting where a day's highlights came from. The whole day is
    distilled in one pass, so a highlight can't be traced to one entry — this names
    the day's sources instead, and keeps it to a couple so it stays readable under
    a bullet. Empty when there's nothing worth naming."""
    named: list[str] = []
    for e in entries:
        src = (e.get("source") or "").strip()
        if e.get("kind") in _NAMED_KINDS and src and src not in named:
            named.append(src[:MAX_SOURCE_CHARS])
    if named:
        return " · ".join(named[:MAX_LABEL_SOURCES])
    if any(e.get("kind") == "reflection" for e in entries):
        return "From your reflections"
    return ""


def build_highlights(db: Session, player: Player, day: str,
                     problems: list[str] | None = None) -> list[Highlight]:
    """Distil `day` into keepable lines, once. Idempotent: a day that already has
    highlights returns them untouched rather than paying for a second LLM call.

    A distillation that fails is not fatal: the reason is appended to `problems` and
    no highlights are returned. The rest of the email — the spaced recall and the
    day's record — needs no model at all, and losing the whole 7am email because a
    free-tier quota ran out is the worst possible trade. Nothing is written either,
    so the day distils properly the next time it's asked for."""
    existing = (
        db.query(Highlight)
        .filter_by(player_id=player.id, day=day)
        .order_by(Highlight.created_at)
        .all()
    )
    if existing:
        return existing

    entries = gather(db, player, day)
    if not entries or not llm.enabled():
        return []

    try:
        items = llm.distill_learning(entries)["highlights"]
    except Exception as err:
        llm.note_refusal(err)  # a per-day refusal closes the window for everyone
        reason = f"not distilled ({_why(err)})"
        print(f"[arise.digest] {reason}; sending the rest of the email.", file=sys.stderr)
        if problems is not None:
            problems.append(reason)
        return []
    if not items:
        return []

    label = source_label(entries)
    rows = [
        Highlight(
            player_id=player.id, day=day, text=it["text"],
            cue=it.get("cue", ""), hook=it.get("hook", ""), source_label=label,
            box=0, due=_due_after(day, 0),
        )
        for it in items
    ]
    db.add_all(rows)
    db.commit()
    update_thread(db, player, day, entries, [it["text"] for it in items])
    return rows


# ── Threads — the running summary per book ───────────────────────────────────

# 'Deep Work, ch 2', 'Deep Work ch. 2-3', 'Deep Work pp 40-52' → all one thread.
# The marker must follow a separator, or the 'ch' inside a title like 'Catch 22'
# would be read as a chapter and the book would become 'Cat'.
_CHAPTERS = re.compile(
    r"(?:[,;:]\s*|\s+)(?:ch|chap|chapter|chapters|p|pp|page|pages)\.?\s*\d.*$", re.I
)


def thread_key(source: str) -> str:
    """A source name without its chapter marker, lowercased — so each day's reading
    of the same book lands on the same thread instead of starting a new one."""
    return " ".join(_CHAPTERS.sub("", source).split()).strip(" ,;:-–").lower()


def update_thread(db: Session, player: Player, day: str, entries: list[dict],
                  lines: list[str]) -> Thread | None:
    """Fold the day's ideas into the running summary of the book they came from.

    Only books get a thread: the point is a text read across many sittings, which is
    what the recondensing has to work on. A day with several books picks the first —
    threads are per source, and one sentence spanning two books would describe
    neither. A failure here leaves the previous sentence untouched; losing a morning
    is fine, losing the thread is not."""
    book = next((e for e in entries if e["kind"] == "book" and e.get("source")), None)
    if book is None or not lines:
        return None

    key = thread_key(book["source"])
    if not key:
        return None

    row = db.query(Thread).filter_by(player_id=player.id, key=key).first()
    if row is not None and row.day == day:
        return row  # already folded in today; don't pay for it twice

    try:
        summary = llm.thread_summary(book["source"], row.summary if row else "", lines)
    except Exception as err:
        # Deliberately not llm.log_failure: its message is about falling back to the
        # quest pools, which would send you looking in the wrong place at 7am.
        print(f"[arise.digest] thread not updated ({_why(err)}); keeping the previous "
              f"sentence.", file=sys.stderr)
        return row
    if not summary:
        return row

    if row is None:
        # days=0 explicitly: the column default only lands at flush, and we increment
        # before then.
        row = Thread(player_id=player.id, key=key, title=book["source"], days=0)
        db.add(row)
    row.title = book["source"]
    row.summary = summary
    row.days = (row.days or 0) + 1
    row.day = day
    db.commit()
    return row


def thread_for(db: Session, player: Player, day: str) -> dict | None:
    """The running summary to show alongside `day` — the thread last touched on or
    before it, so the digest reflects what was true that morning."""
    row = (
        db.query(Thread)
        .filter(Thread.player_id == player.id, Thread.day <= day, Thread.summary != "")
        .order_by(Thread.day.desc(), Thread.updated_at.desc())
        .first()
    )
    if row is None:
        return None
    return {"title": row.title, "summary": row.summary, "days": row.days}


# ── Recall — the spaced part ─────────────────────────────────────────────────


def interval_for(box: int) -> int:
    """Days until a highlight in `box` comes back. Past the last rung it stays there
    — something recalled five times running doesn't need a sixth schedule."""
    return RECALL_INTERVALS[min(max(box, 0), len(RECALL_INTERVALS) - 1)]


def _due_after(day: str, box: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=interval_for(box))).isoformat()


def _backfill_due(db: Session, player: Player) -> None:
    """Give a due date to highlights distilled before scheduling existed. Spread by
    their own age rather than set to today, so a long backlog doesn't all come due in
    one morning."""
    rows = db.query(Highlight).filter(
        Highlight.player_id == player.id, Highlight.due == ""
    ).all()
    if not rows:
        return
    for r in rows:
        r.box = r.box or 0
        r.due = _due_after(r.day, r.box)
    db.commit()


def recall_set(db: Session, player: Player, day: str) -> list[dict]:
    """The highlights that have come due — the spaced half of the digest.

    Leitner: every highlight sits in a box, each box further from the last. Being
    shown moves it up one; grading it as missed drops it back to the first, so it
    returns tomorrow rather than in a month. Oldest-due first, so nothing rots at the
    bottom of the pile.

    A read never advances anything — only `advance_shown`, once a digest is actually
    sent — so preview and the app can look as often as they like."""
    _backfill_due(db, player)
    rows = (
        db.query(Highlight)
        .filter(
            Highlight.player_id == player.id,
            Highlight.day < day,  # the day's own highlights are the fresh section
            Highlight.due != "",
            Highlight.due <= day,
        )
        .order_by(Highlight.due, Highlight.created_at)
        .limit(PER_DIGEST * 3)  # a pool to interleave from, not the final cut
        .all()
    )
    picked = [
        {
            "id": r.id,
            "text": r.text,
            "cue": r.cue or "",
            "hook": r.hook or "",
            "box": r.box or 0,
            "day": r.day,
            "source_label": r.source_label,
            "days_ago": (date.fromisoformat(day) - date.fromisoformat(r.day)).days,
        }
        for r in rows
    ]
    return _interleave(picked)[:PER_DIGEST]


GRADES = ("got", "shaky", "missed")


def grade(db: Session, player: Player, highlight_id: str, value: str, day: str) -> dict | None:
    """Record how a recall went, and reschedule accordingly.

    Straight from the index-card method: one you knew goes to the back of the pile,
    one you half-knew slides into the middle, one you had no clue about goes near the
    front where you'll meet it again almost immediately."""
    if value not in GRADES:
        raise ValueError(f"grade must be one of {GRADES}")

    row = db.get(Highlight, highlight_id)
    if row is None or row.player_id != player.id:
        return None

    if value == "got":
        row.box = (row.box or 0) + 1
    elif value == "missed":
        row.box = 0
    # 'shaky' leaves the box where it is: seen again at the same spacing, not further.

    row.due = _due_after(day, row.box)
    db.commit()
    return {"id": row.id, "box": row.box, "due": row.due}


def advance_shown(db: Session, player: Player, day: str, items: list[dict]) -> None:
    """Move every highlight the email just asked about up a box.

    This is what keeps the ladder working for someone who never grades anything: a
    plain exposure counts as a pass, which reproduces the fixed 1/3/7/16/35 spacing.
    Grading only ever corrects that guess."""
    for it in items:
        row = db.get(Highlight, it.get("id") or "")
        if row is None or row.player_id != player.id:
            continue
        row.box = (row.box or 0) + 1
        row.due = _due_after(day, row.box)
    db.commit()


def _interleave(picks: list[dict]) -> list[dict]:
    """Reorder so consecutive cues rarely share a source. Practice blocked by one book
    feels smoother and sticks less: mixing forces you to work out *what kind* of thing
    is being asked before you can answer it, which is most of the work in real recall.

    Greedy and order-stable — no randomness, so a given day always renders the same."""
    remaining = list(picks)
    out: list[dict] = []
    while remaining:
        prev = out[-1]["source_label"] if out else None
        nxt = next((p for p in remaining if p["source_label"] != prev), remaining[0])
        remaining.remove(nxt)
        out.append(nxt)
    return out


def build_context(db: Session, player: Player, day: str) -> dict:
    """Everything the email needs for `day`, built once and shared by preview and send.

    `problems` collects anything that degraded the build (a distillation that
    couldn't run) so the send can record it. It never stops the email."""
    problems: list[str] = []
    highlights = build_highlights(db, player, day, problems)
    return {
        "problems": problems,
        "day": day,
        "name": player.name,
        "highlights": [
            {
                "id": h.id, "text": h.text, "cue": h.cue or "", "hook": h.hook or "",
                "box": h.box or 0, "source_label": h.source_label,
            }
            for h in highlights
        ],
        "recall": recall_set(db, player, day),
        "thread": thread_for(db, player, day),
        "recap": recap.of(db, player, day),
        "avatar": player.avatar or "",  # data URI; "" when no picture is set
    }


def quizzable(recall: list[dict]) -> list[dict]:
    """The recall picks that can actually be asked. Highlights distilled before cues
    existed have none, and a highlight without a question is better left out than
    asked with one made up on the spot."""
    return [r for r in recall if r.get("cue")]


# ── Rendering ────────────────────────────────────────────────────────────────

_BASE = "#F0E8D8"
_CARD = "#FAF5EB"
_HAIRLINE = "#E4D9C2"
_TEXT = "#2C2720"
_MUTED = "#7E7361"
_ACCENT = "#B0603A"


# The profile picture travels as an inline attachment the HTML points at by content
# id. It can't just be the stored data URI: Gmail and Outlook strip `src="data:…"`
# images outright, so an embedded one would arrive as a broken box every morning.
AVATAR_CID = "arise-avatar"
AVATAR_SRC = f"cid:{AVATAR_CID}"
AVATAR_PX = 44

_DATA_URI = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$", re.I)


def avatar_part(avatar: str) -> dict | None:
    """The stored avatar as a Resend attachment, or None when there's nothing usable.

    The app already keeps it as a base64 data URI (that's what an <img> in the client
    needs), so this only splits it back into a part. Anything that isn't an inline
    base64 image is ignored rather than repaired: a picture is the least important
    thing in the email, and guessing at a malformed one would cost the whole send."""
    match = _DATA_URI.match((avatar or "").strip())
    if match is None:
        return None
    mime = match.group(1).lower()
    data = "".join(match.group(2).split())  # base64 can arrive wrapped
    if not data:
        return None
    return {
        "filename": f"avatar.{mime.split('/')[-1].replace('jpeg', 'jpg')}",
        "content": data,
        "content_type": mime,
        "content_id": AVATAR_CID,
    }


def _pretty_day(day: str) -> str:
    return date.fromisoformat(day).strftime("%A, %-d %B")


def _ago(days: int) -> str:
    if days == 1:
        return "yesterday"
    if days < 14:
        return f"{days} days ago"
    if days < 60:
        return f"{round(days / 7)} weeks ago"
    return f"{round(days / 30)} months ago"


def subject_for(ctx: dict) -> str:
    n = len(quiz_items(ctx))
    if not n:
        return f"Recall · {_pretty_day(ctx['day'])}"
    return f"Recall · {n} question{'s' if n != 1 else ''} from {_pretty_day(ctx['day'])}"


FLESH_NUDGE = (
    "Anything else surface just now? Add it while it's still there — what you can "
    "still dredge up today is gone by tomorrow."
)

# Recognising an answer feels exactly like knowing it, which is how people study for
# hours and still meet a blank page cold. The only way to tell the two apart is to
# produce the answer before seeing it.
RECALL_INSTRUCTION = (
    "Look away and answer out loud, or write it down, before you scroll. Recognising "
    "an answer when you see it is not the same as recalling it — and only one of the "
    "two is learning."
)


# Above this share of words in common, two highlights are the same idea said twice.
# Measured against the shorter of the pair, so a terse restatement of a longer line
# still counts as a repeat.
DUPE_OVERLAP = 0.6

_WORD = re.compile(r"[a-z][a-z']+")

# Long enough to survive the length filter, but carrying no topic. Two unrelated
# highlights phrased the same way ("this idea is about…") would otherwise look like
# a repeat purely on scaffolding.
_STOPWORDS = frozenset("""
about above after again against also because been before being below between both
came come could does doing down during each else even ever every from further have
having here into itself just like made make many more most much must only other
over same should some such than that their them then there these they thing things
this those through under until very were what when where which while will with
would your yours idea ideas
""".split())


def _keywords(s: str) -> set[str]:
    return {w for w in _WORD.findall(s.lower()) if len(w) > 3 and w not in _STOPWORDS}


def _too_alike(a: str, b: str) -> bool:
    ta, tb = _keywords(a), _keywords(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / min(len(ta), len(tb)) >= DUPE_OVERLAP


def quiz_items(ctx: dict) -> list[dict]:
    """Everything this email asks, in the order it asks it. Yesterday comes first:
    it's the 24-hour mark, the last moment the surrounding detail is still
    retrievable, so that's where adding flesh pays. The spaced picks follow.

    Each day is distilled on its own, so two days on the same book can land on the
    same idea. Asking it twice in one email wastes a rung of the ladder and reads as
    a bug, so a repeat is dropped in favour of the earlier one."""
    candidates = [
        {**h, "days_ago": 1, "fresh": True} for h in ctx["highlights"] if h.get("cue")
    ]
    candidates += [{**r, "fresh": False} for r in quizzable(ctx["recall"])]

    items: list[dict] = []
    for c in candidates:
        if any(_too_alike(c["text"], kept["text"]) for kept in items):
            continue
        items.append(c)
    return items


def _uncued(ctx: dict) -> list[dict]:
    return [h for h in ctx["highlights"] if not h.get("cue")]


def _recap_rows(ctx: dict) -> list[dict]:
    """The day's record, tolerating a context built before the recap existed."""
    return recap.lines(ctx.get("recap") or recap.empty(ctx["day"]))


def render_text(ctx: dict) -> str:
    """The plain-text part — also the readable fallback if the HTML is stripped."""
    items = quiz_items(ctx)
    rows = _recap_rows(ctx)
    out = [f"Recall · {_pretty_day(ctx['day'])}", ""]

    if not items and not _uncued(ctx) and not rows:
        out += ["Nothing logged. A quiet day is still a day — rest counts.", "", "— Arise"]
        return "\n".join(out)

    if items:
        out += ["TRY TO RECALL", "", f"  {RECALL_INSTRUCTION}", ""]
        for i, it in enumerate(items, 1):
            when = "yesterday" if it["fresh"] else _ago(it["days_ago"])
            out.append(f"  {i}. {it['cue']}")
            out.append(f"     ({when})")
        out += ["", "─" * 40, "", "ANSWERS", ""]
        for i, it in enumerate(items, 1):
            out.append(f"  {i}. {it['text']}")
            if it.get("hook"):
                out.append(f"     hook: {it['hook']}")

    extra = _uncued(ctx)
    if extra:
        out += ["", "Also from yesterday", ""]
        for h in extra:
            out.append(f"  - {h['text']}")

    if rows:
        xp = (ctx.get("recap") or {}).get("xp", 0)
        heading = "THE DAY ITSELF" + (f" — {xp} XP" if xp else "")
        # The rule only separates this from something above it.
        out += ["", "─" * 40, ""] if (items or extra) else [""]
        out += [heading, ""]
        for row in rows:
            out.append(f"  • {row['label']}")
            if row["detail"]:
                out.append(f"    {row['detail']}")

    thread = ctx.get("thread")
    if thread:
        out += ["", f"THE BOOK SO FAR — {thread['title']}", "", f"  {thread['summary']}"]

    out += ["", FLESH_NUDGE, "", "— Arise"]
    return "\n".join(out)


def _li(text: str, sub: str = "") -> str:
    note = (
        f'<div style="color:{_MUTED};font-size:12px;margin-top:4px">{sub}</div>' if sub else ""
    )
    return (
        f'<li style="margin:0 0 14px;padding-left:6px;line-height:1.5">'
        f'<span style="color:{_TEXT};font-size:15px">{text}</span>{note}</li>'
    )


def _h2(label: str) -> str:
    return (
        f'<h2 style="color:{_ACCENT};font-size:13px;letter-spacing:.08em;'
        f'text-transform:uppercase;margin:30px 0 14px">{label}</h2>'
    )


def _numbered(items: list[dict], answers: bool) -> str:
    """The quiz, either as questions or as the answers to them. Same numbering both
    times — the number is the only thing tying an answer back to its question."""
    rows = []
    for i, it in enumerate(items, 1):
        if answers:
            body, sub = it["text"], it.get("hook") or ""
            if sub:
                sub = f"hook: {sub}"
        else:
            body = it["cue"]
            sub = "yesterday" if it["fresh"] else _ago(it["days_ago"])
        note = (
            f'<div style="color:{_MUTED};font-size:12px;margin-top:4px">{sub}</div>'
            if sub else ""
        )
        rows.append(
            f'<tr><td style="vertical-align:top;color:{_MUTED};font-size:15px;'
            f'padding:0 10px 14px 0;width:22px">{i}.</td>'
            f'<td style="padding:0 0 14px;line-height:1.5">'
            f'<span style="color:{_TEXT};font-size:15px">{body}</span>{note}</td></tr>'
        )
    return f'<table style="border-collapse:collapse;width:100%">{"".join(rows)}</table>'


def _recap_html(ctx: dict, rows: list[dict], divider: bool = True) -> str:
    """The day's record as a quiet table — a bold line per thing done, its detail
    under it. A table rather than a list because Outlook indents `ul` unpredictably,
    and this section is the one people scan rather than read."""
    xp = (ctx.get("recap") or {}).get("xp", 0)
    cells = []
    for row in rows:
        detail = (
            f'<div style="color:{_MUTED};font-size:12px;margin-top:3px">{row["detail"]}</div>'
            if row["detail"] else ""
        )
        cells.append(
            f'<tr><td style="padding:0 0 12px;line-height:1.45">'
            f'<span style="color:{_TEXT};font-size:15px">{row["label"]}</span>'
            f'{detail}</td></tr>'
        )
    earned = (
        f'<div style="color:{_MUTED};font-size:12px;margin:-6px 0 14px">{xp} XP earned</div>'
        if xp else ""
    )
    rule = f'<div style="border-top:1px solid {_HAIRLINE};margin:30px 0 0"></div>' if divider else ""
    return (
        rule
        + _h2("The day itself")
        + earned
        + f'<table style="border-collapse:collapse;width:100%">{"".join(cells)}</table>'
    )


def _masthead(ctx: dict, avatar_src: str | None) -> str:
    """Recall, the day, and the hunter's own face beside them when there is one.

    `avatar_src` is what the <img> points at: `cid:…` for a real send, and the stored
    data URI when it's left out — that's the in-app preview, which is a browser and
    renders one happily."""
    label = (
        f'<div style="color:{_MUTED};font-size:12px;letter-spacing:.08em;'
        f'text-transform:uppercase">Recall</div>'
        f'<h1 style="color:{_TEXT};font-size:20px;margin:6px 0 4px;font-weight:700">'
        f'{_pretty_day(ctx["day"])}</h1>'
    )
    src = avatar_src or ctx.get("avatar") or ""
    if not src:
        return label
    # A table, not flexbox: Outlook ignores flex, and a two-cell row is the one layout
    # every client agrees on. alt is empty on purpose — with images blocked, a caption
    # where the face should be is noise, and the header reads fine without it.
    return (
        f'<table style="border-collapse:collapse;width:100%"><tr>'
        f'<td style="width:{AVATAR_PX}px;padding:0 14px 0 0;vertical-align:middle">'
        f'<img src="{src}" width="{AVATAR_PX}" height="{AVATAR_PX}" alt="" '
        f'style="display:block;width:{AVATAR_PX}px;height:{AVATAR_PX}px;'
        f'border-radius:{AVATAR_PX // 2}px;border:1px solid {_HAIRLINE};'
        f'object-fit:cover"></td>'
        f'<td style="vertical-align:middle">{label}</td>'
        f'</tr></table>'
    )


def render_html(ctx: dict, avatar_src: str | None = None) -> str:
    """Inline-styled HTML in Arise's sandy palette. No template engine, no external
    CSS — mail clients strip stylesheets, so every rule has to travel inline.

    Questions first and answers well below them is the whole point: the few seconds
    of not-quite-remembering is what strengthens the memory, and an answer sitting
    beside its question removes that entirely."""
    items = quiz_items(ctx)
    extra = _uncued(ctx)
    rows = _recap_rows(ctx)

    if not items and not extra and not rows:
        body = (
            f'<ul style="margin:0;padding-left:18px">'
            f'{_li("Nothing logged. A quiet day is still a day — rest counts.")}</ul>'
        )
    else:
        body = ""
        if items:
            body += (
                _h2("Try to recall")
                + f'<div style="color:{_MUTED};font-size:12px;margin:-6px 0 16px;'
                f'line-height:1.5">{RECALL_INSTRUCTION}</div>'
                + _numbered(items, answers=False)
                + f'<div style="border-top:1px solid {_HAIRLINE};margin:30px 0 0"></div>'
                + _h2("Answers")
                + _numbered(items, answers=True)
            )
        if extra:
            body += _h2("Also from yesterday")
            body += f'<ul style="margin:0;padding-left:18px">' + "".join(
                _li(h["text"]) for h in extra
            ) + "</ul>"
        if rows:
            body += _recap_html(ctx, rows, divider=bool(items or extra))
        thread = ctx.get("thread")
        if thread:
            body += (
                _h2("The book so far")
                + f'<div style="color:{_TEXT};font-size:15px;line-height:1.55">'
                f'{thread["summary"]}</div>'
                f'<div style="color:{_MUTED};font-size:12px;margin-top:6px">'
                f'{thread["title"]} · {thread["days"]} '
                f'sitting{"s" if thread["days"] != 1 else ""}</div>'
            )
        body += (
            f'<div style="background:{_BASE};border-radius:10px;padding:14px 16px;'
            f'margin-top:26px;color:{_TEXT};font-size:13px;line-height:1.5">'
            f'{FLESH_NUDGE}</div>'
        )

    return (
        f'<div style="background:{_BASE};padding:28px 16px;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif">'
        f'<div style="max-width:560px;margin:0 auto;background:{_CARD};'
        f'border:1px solid {_HAIRLINE};border-radius:14px;padding:28px">'
        f'{_masthead(ctx, avatar_src)}'
        f'{body}'
        f'<div style="border-top:1px solid {_HAIRLINE};margin-top:28px;padding-top:14px;'
        f'color:{_MUTED};font-size:12px">Showing up is the win. — Arise</div>'
        f'</div></div>'
    )


# ── Sending ──────────────────────────────────────────────────────────────────


def _why(err: Exception) -> str:
    """A short, safe reason a send failed — the exception type plus the HTTP status
    and body when there is one. Bare 'HTTPError' is useless at 7am; the status is
    what tells you whether it's the key, the recipient, or the service. Never
    includes the request, which carries the API key."""
    detail = type(err).__name__
    code = getattr(err, "code", None)
    if code is not None:
        detail += f" {code}"
    read = getattr(err, "read", None)
    if callable(read):
        try:
            body = read().decode(errors="replace").strip()
        except Exception:
            body = ""
        if body:
            detail += f": {body[:200]}"
    return detail


def _record(db: Session, player: Player, day: str, status: str, detail: str, count: int) -> dict:
    db.merge(DigestRun(
        player_id=player.id, day=day, status=status, detail=detail, highlight_count=count,
    ))
    db.commit()
    return {"day": day, "status": status, "detail": detail, "highlight_count": count}


def send_daily(db: Session, player: Player, day: str, force: bool = False) -> dict:
    """Build and send the digest for `day`. At most once per day unless forced, so a
    manual send and the scheduled job can't both land in the inbox.

    Never raises for an expected condition — an unconfigured mailer or an empty day
    is recorded and reported, not an error. Transport failures are recorded too, then
    re-raised so the job's log says what broke."""
    if not force:
        existing = db.get(DigestRun, {"player_id": player.id, "day": day})
        if existing is not None and existing.status == "sent":
            return {
                "day": day, "status": "skipped", "detail": "already sent",
                "highlight_count": existing.highlight_count,
            }

    if not mailer.enabled():
        return _record(db, player, day, "skipped", "mailer not configured", 0)

    ctx = build_context(db, player, day)
    notes = "; ".join(ctx.get("problems") or [])
    # A day with nothing to recall can still be a day worth a record — quests, money,
    # to-dos. Only a genuinely empty day is skipped.
    if not ctx["highlights"] and not ctx["recall"] and not recap.had_anything(ctx["recap"]):
        return _record(db, player, day, "skipped", notes or "nothing logged", 0)

    # The picture rides along as a part, and the HTML points at it by content id —
    # with no avatar set, both fall away and the email is what it always was.
    part = avatar_part(ctx.get("avatar", ""))
    html = render_html(ctx, avatar_src=AVATAR_SRC if part else None)
    try:
        mailer.send(subject_for(ctx), html, render_text(ctx),
                    attachments=[part] if part else None)
    except Exception as err:
        _record(db, player, day, "failed", _why(err), len(ctx["highlights"]))
        raise

    # Only after it actually left: a send that failed asks the same questions again
    # tomorrow rather than silently burning a rung.
    advance_shown(db, player, day, quiz_items(ctx))
    # 'sent' with a note: the email went out, and the note says what it went out
    # without — otherwise a quota-shaped hole in a morning leaves no trace anywhere.
    return _record(db, player, day, "sent", notes, len(ctx["highlights"]))
