"""The morning digest: yesterday's learning distilled, and older cards asked again.

Reading a lot and remembering little is the problem this solves. Each day's
learnings (see models.Learning) are distilled once by the LLM into a handful of
keepable lines — Highlights — each carrying the question it answers. Those cards
are then scheduled by recall.py; this module makes them, gathers the day around
them, and renders and sends the email.

The email asks before it tells. Cues come first, answers sit well below them, and
the picks span an expanding ladder of past days. Three things drive that shape:

* **Retrieval, not review.** Being asked and briefly failing fixes a memory;
  re-reading a line you recognise mostly produces the feeling of knowing it.
* **Expanding intervals.** Forgetting is steepest early, so the rungs start close
  and stretch (recall.RECALL_INTERVALS).
* **The 24-hour window.** Yesterday's material is asked first, because that's the
  last moment the surrounding detail can still be dredged up and written down —
  hence digest_render.FLESH_NUDGE at the foot of every email.

Every highlight carries a hook — the vivid third thing that holds a fact and its
question together (see llm._LEARNING_PROMPT). Arbitrary material gets a mnemonic;
an idea you could re-derive gets the picture it lives in instead, which is an aid
to the understanding rather than a rival to it. Highlights distilled before that
was true are hooked a morning at a time by `backfill_hooks`.

Distilling is idempotent — a day already distilled is never paid for twice — so a
preview costs nothing and `send_daily` is the only step with a side effect.
"""

import sys
from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import digest_render, llm, mailer, reading, recall, recap
from .models import (Completion, DigestRun, Highlight, Learning, Player, QuestNote,
                     Thread)

READING_QUEST_ID = "d-read"


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

    # Both of the places below attribute to the book, so the log is read once here
    # rather than per note.
    chapters = _chapters_today(db, player, day)
    book_label = _book_label(player.current_book, chapters)

    # As the card was titled that day, not as the slot is seeded: a pool slot is
    # called something different every period, and a note filed under a name the
    # hunter never saw reads as someone else's note (see `recap.quest_titles`).
    titles = recap.quest_titles(db, player, day)
    for note in (
        db.query(QuestNote)
        .filter_by(player_id=player.id, day=day)
        .order_by(QuestNote.created_at)
    ):
        # The prompt is useful context for the distiller (it's the question being
        # answered) but it's a paragraph, not a name — so it rides in the text and
        # never becomes an attribution label. The quest it answers is the name: a
        # note written against the reading daily is about the book, so it files with
        # the book, and every other quest's notes file under the quest.
        body = f"(answering: {note.prompt})\n{note.text}" if note.prompt else note.text
        source = book_label if note.quest_id == READING_QUEST_ID else ""
        entries.append({
            "kind": "reflection",
            "source": source or titles.get(note.quest_id, ""),
            "text": body,
        })

    # What they read today, from the reading log — real chapter numbers, so the
    # distiller can be specific. Skipped when they already logged the book on the
    # Learn screen, where they'd have written actual notes.
    logged_a_book = any(e["kind"] == "book" for e in entries)
    if player.current_book and not logged_a_book:
        if chapters:
            entries.append({
                "kind": "book",
                "source": book_label,
                "text": f"Read chapters {chapters} — no notes were taken, so stay close to the source.",
            })
        elif _read_today(db, player, day):
            # The daily ticked with nothing logged: worth including as a weak signal,
            # but there's no telling which chapters, so it can't be specific.
            entries.append({
                "kind": "book",
                "source": book_label,
                "text": "Read today's chapters (which ones wasn't recorded, so stay general).",
            })

    return entries


def _book_label(book: str, chapters: str) -> str:
    """The book being read, carrying today's chapters when the log named any — the
    attribution a highlight drawn from today's reading wears. Empty with no book on
    the go. Shared by the reading entry and the reading daily's own note, so both
    land on one pile rather than two spellings of the same book."""
    if not book:
        return ""
    return f"{book}, ch {chapters}" if chapters else book


def _chapters_today(db: Session, player: Player, day: str) -> str:
    """Which chapters were logged today, as the hunter labelled them ('5–7, 8'), or
    '' when nothing was logged."""
    return reading.chapter_labels(reading.on_day(reading.logs_of(db, player), day))


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
    """A short line crediting where a day's highlights came from, naming a couple of
    the day's sources so it stays readable under a bullet. Empty when there's nothing
    worth naming.

    The fallback, not the rule: a highlight that named its own entry wears that entry's
    source (see `label_for`). This is what's left for one that didn't, and it is
    deliberately a day-level guess — which is why it must never be the normal path."""
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


def label_for(entries: list[dict], item: dict) -> str:
    """Where one distilled line came from: the source of the entry it named.

    A day is distilled in one pass across every entry, so the attribution has to come
    back from the model with the line — a single label per day credits a book with
    whatever else was learned that day, and the app sorts cards into piles by this
    field, so the miscredited ones land in the wrong book's stack.

    Falls back to the day's own label when the model named no entry or named one that
    doesn't exist. That's the old behaviour, and it's wrong in the same way — but a
    card with a vague label beats one dropped for want of a number."""
    index = item.get("entry")
    if isinstance(index, int) and 0 <= index < len(entries):
        source = (entries[index].get("source") or "").strip()
        if source:
            return source
    return source_label(entries)


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

    rows = [
        Highlight(
            player_id=player.id, day=day, text=it["text"],
            cue=it.get("cue", ""), hook=it.get("hook", ""),
            source_label=label_for(entries, it),
            box=0, due=recall.due_after(day, 0),
        )
        for it in items
    ]
    db.add_all(rows)
    db.commit()
    update_thread(db, player, day, entries, thread_lines(entries, rows))
    return rows


# ── Threads — the running summary per book ───────────────────────────────────


def day_book(entries: list[dict]) -> dict | None:
    """The book a day's thread is about. A day with several picks the first —
    threads are per source, and one sentence spanning two books would describe
    neither."""
    return next((e for e in entries if e["kind"] == "book" and e.get("source")), None)


def thread_lines(entries: list[dict], rows: list) -> list[str]:
    """Of a day's distilled lines, the ones that belong to the book — matched on the
    label each carries, the way a title is matched anywhere else (reading.book_key).

    The thread is a running summary of one text read across many sittings, so a line
    that came from somewhere else has no business in it. Folding the whole day in put
    a money quest's notes into a book's sentence: the Meditations thread came out
    describing emergency funds and compounding, which is not a summary of Meditations.

    An unlabelled line still folds in: it is ambiguous, not foreign. Only a line
    labelled as something *else* is demonstrably not the book's, and that is the one
    the contamination came from. Ruling out the ambiguous ones too would leave the
    catch-up repair (which re-folds days distilled before labels were per-line) with
    nothing to fold."""
    book = day_book(entries)
    if book is None:
        return []
    key = reading.book_key(book["source"])
    if not key:
        return []
    return [
        r.text for r in rows
        if reading.book_key(getattr(r, "source_label", "") or "") in (key, "")
    ]


def update_thread(db: Session, player: Player, day: str, entries: list[dict],
                  lines: list[str]) -> Thread | None:
    """Fold the day's ideas into the running summary of the book they came from.

    Only books get a thread: the point is a text read across many sittings, which is
    what the recondensing has to work on. A failure here leaves the previous sentence
    untouched; losing a morning is fine, losing the thread is not.

    `lines` must already be the book's own — see `thread_lines`, which is how both
    callers narrow a mixed day down before folding."""
    book = day_book(entries)
    if book is None or not lines:
        return None

    key = reading.book_key(book["source"])
    if not key:
        return None
    title = reading.book_name(book["source"])

    row = db.query(Thread).filter_by(player_id=player.id, key=key).first()
    if row is not None and row.day >= day:
        # Already folded in for this day — don't pay for it twice — or for a later
        # one, in which case folding now would drag the sentence backwards.
        return row

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
        row = Thread(player_id=player.id, key=key, title=title, days=0)
        db.add(row)
    row.title = title
    row.summary = summary
    row.days = (row.days or 0) + 1
    row.day = day
    db.commit()
    return row


def sittings_behind(db: Session, player: Player, row: Thread, book: str) -> int:
    """How many times this book has been sat with.

    Taken from the reading log whenever it has anything on the book, so the panel
    quotes the same sittings the reading card lists rather than its own count of
    folds — those two drift apart on any day the reading daily was ticked without
    chapters logged. The folds are the fallback for a book read entirely on the Learn
    screen, which never touches the reading log; one fold is one day spent with it,
    so it means the same kind of thing."""
    logged = len(reading.logs_of_book(db, player.id, book))
    return logged or (row.days or 0)


def thread_for(db: Session, player: Player, day: str, key: str | None = None) -> dict | None:
    """The running summary to show alongside `day` — the thread last touched on or
    before it, so the digest reflects what was true that morning.

    `key` narrows it to one book. The two callers want different things and the
    difference matters: a digest for a past day should show whatever thread was
    current that morning, even if that book is long finished, while the app should
    only ever show the sentence for the book actually open — otherwise finishing a
    book leaves "The book so far" describing the one you just closed, because the
    unscoped query picks the most recently touched thread regardless of book.
    """
    q = db.query(Thread).filter(
        Thread.player_id == player.id, Thread.day <= day, Thread.summary != ""
    )
    if key is not None:
        q = q.filter(Thread.key == key)
    row = q.order_by(Thread.day.desc(), Thread.updated_at.desc()).first()
    if row is None:
        return None
    # Stripped again on the way out: rows written before titles were normalised still
    # carry the chapter marker of whichever day last folded in.
    book = reading.book_name(row.title)
    return {
        "title": book,
        "summary": row.summary,
        "sittings": sittings_behind(db, player, row, book),
    }


# How far back a repair run will reach. Beyond a week the recall value has mostly
# gone, and a long backlog would spend the allowance on history instead of today.
CATCH_UP_DAYS = 7
# Left for the day being sent — a whole morning is three calls (distil, rewrite the
# book's running sentence, then hook the older answers), each an attempt plus its
# two retries.
_TODAY_RESERVE = llm.DIGEST_RESERVE


def catch_up(db: Session, player: Player, day: str) -> list[str]:
    """Distil recent days that were logged but never distilled, and return them.

    A day is only asked for once, on the morning after it: if the model was
    unreachable then — a spent quota, an outage — that day's reading was silently
    never turned into anything, and nothing came back to ask again. This is that
    second ask. A day that *was* distilled still gets its book thread folded if that
    separate call was the one that failed — otherwise the running sentence sits on an
    old sitting for good, since nothing revisits a day that already has highlights.

    Oldest first, and deliberately before the day being sent: `update_thread` stamps
    the thread with the day it folded in, so repairing an old day afterwards would
    drag the running summary backwards. Stops while `_TODAY_RESERVE` is still on the
    table, because today matters more than a week ago."""
    repaired: list[str] = []
    today = date.fromisoformat(day)
    for back in range(CATCH_UP_DAYS, 0, -1):
        if llm.budget_left() <= _TODAY_RESERVE:
            break
        past = (today - timedelta(days=back)).isoformat()
        entries = gather(db, player, past)
        if not entries:
            continue  # nothing was logged; not a miss
        kept = (
            db.query(Highlight)
            .filter_by(player_id=player.id, day=past)
            .order_by(Highlight.created_at)
            .all()
        )
        if kept:
            # Distilled already, but folding the book's running sentence is a second
            # call that fails on its own — and a day with highlights was never asked
            # about again, so a sentence stuck on an old sitting stayed stuck. Retry
            # that call alone, from the lines already kept: no second distillation.
            update_thread(db, player, past, entries, thread_lines(entries, kept))
            continue
        if build_highlights(db, player, past):
            repaired.append(past)
    if repaired:
        print(f"[arise.digest] distilled {len(repaired)} missed day(s): "
              f"{', '.join(repaired)}", file=sys.stderr)
    return repaired


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
        "recall": recall.due_set(db, player, day),
        "thread": thread_for(db, player, day),
        "recap": recap.of(db, player, day),
        "avatar": player.avatar or "",  # data URI; "" when no picture is set
    }


# Two digests' worth in one call: the answers asked this morning, with a little room
# for the ones a repeat pushed out, so the backlog drains in mornings rather than weeks.
HOOKS_PER_CALL = recall.PER_DIGEST * 2


def backfill_hooks(db: Session, player: Player, ctx: dict,
                   problems: list[str] | None = None) -> int:
    """Give this email's older answers the hook the fresh ones now come with.

    Every highlight distilled from here on carries one, but the ones already stored
    predate that and go on being asked for weeks — so the lines this morning actually
    quizzes are hooked in one call, and keep them for every later showing. Only the
    missing ones are sent, so the backlog costs a call a morning until it is gone and
    nothing at all after that.

    Runs from the send, never from the preview: it writes, and it spends. It is also
    last in line for the morning's allowance, after the distillation and the thread —
    a hook on an old line is the one thing here that can wait for tomorrow.

    A failure is not fatal: the reason is appended to `problems` and the answers go out
    bare, as they did before hooks were on all of them."""
    asked = {it["id"] for it in digest_render.quiz_items(ctx) if it.get("id")}
    pending = [
        h for h in list(ctx["highlights"]) + list(ctx["recall"])
        if h.get("id") in asked and h.get("cue") and not h.get("hook")
    ][:HOOKS_PER_CALL]
    if not pending or not llm.enabled() or llm.budget_left() <= 0:
        return 0

    try:
        hooks = llm.hooks_for([{"text": h["text"], "cue": h["cue"]} for h in pending])
    except Exception as err:
        llm.note_refusal(err)
        reason = f"hooks not written ({_why(err)})"
        print(f"[arise.digest] {reason}; sending the answers without them.", file=sys.stderr)
        if problems is not None:
            problems.append(reason)
        return 0

    written = 0
    for i, item in enumerate(pending, 1):
        hook = hooks.get(i, "")
        if not hook:
            continue
        row = db.get(Highlight, item["id"])
        if row is None or row.player_id != player.id:
            continue
        row.hook = hook
        item["hook"] = hook  # the email renders from the context, not a re-read
        written += 1
    if written:
        db.commit()
    return written


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

    # Repair first: a day the model couldn't reach is never asked for again on its
    # own, and this is the only thing that runs on a schedule.
    catch_up(db, player, day)

    ctx = build_context(db, player, day)
    # A day with nothing to recall can still be a day worth a record — quests, money,
    # to-dos. Only a genuinely empty day is skipped.
    if not ctx["highlights"] and not ctx["recall"] and not recap.had_anything(ctx["recap"]):
        notes = "; ".join(ctx.get("problems") or [])
        return _record(db, player, day, "skipped", notes or "nothing logged", 0)

    # After the emptiness check, so a quiet morning never spends a call on it.
    backfill_hooks(db, player, ctx, ctx.get("problems"))
    notes = "; ".join(ctx.get("problems") or [])

    # The picture rides along as a part, and the HTML points at it by content id —
    # with no avatar set, both fall away and the email is what it always was.
    part = digest_render.avatar_part(ctx.get("avatar", ""))
    html = digest_render.render_html(ctx, avatar_src=digest_render.AVATAR_SRC if part else None)
    try:
        mailer.send(digest_render.subject_for(ctx), html, digest_render.render_text(ctx),
                    attachments=[part] if part else None)
    except Exception as err:
        _record(db, player, day, "failed", _why(err), len(ctx["highlights"]))
        raise

    # Only after it actually left: a send that failed asks the same questions again
    # tomorrow rather than silently burning a rung.
    recall.advance_shown(db, player, day, digest_render.quiz_items(ctx))
    # 'sent' with a note: the email went out, and the note says what it went out
    # without — otherwise a quota-shaped hole in a morning leaves no trace anywhere.
    return _record(db, player, day, "sent", notes, len(ctx["highlights"]))
