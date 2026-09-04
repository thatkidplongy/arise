"""Rendering the digest: one context dict in, a subject line and two bodies out.

Mail clients are a hostile target — no external stylesheets, no flexbox worth
trusting, inline styles only — so the Organic palette the app runs on is restated
here as hex constants and kept in step with src/theme.ts by hand.

Two bodies go out together, HTML and plain text, because a client that refuses the
first still has to be able to ask the questions. Both orders the same way: cues
first, answers well below them, and the day's record last.

Everything here is a pure function of `ctx` (see digest.build_context) — no session,
no ORM, nothing to commit. That is what lets `/digest/preview` render as often as
it likes without touching a single card's schedule.
"""

import re
from datetime import date

from . import recall, recap

# The Organic palette the app runs on (src/theme.ts) — the email is the same
# system seen through a mail client, so the tokens are kept in step by hand.
_BASE = "#F5EAD8"
_CARD = "#F9F4ED"
_HAIRLINE = "#DCD3C4"
_TEXT = "#201E1D"
_MUTED = "#645C50"
_ACCENT = "#C67139"


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

# The most one email will ever ask. Fresh highlights (up to ten) and the spaced picks
# (up to PER_DIGEST) could otherwise total fifteen, which is homework — and homework is
# what stops getting done. What doesn't fit is not lost: a spaced card that misses the
# cut is never advanced (send_daily advances exactly what was asked), so it stays due
# and comes back tomorrow.
QUIZ_CAP = 8

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
    a bug, so a repeat is dropped in favour of the earlier one.

    QUIZ_CAP is the last word: this is the one list the whole send reads from — the
    subject's count, both bodies, the hooks it backfills and the rungs it advances —
    so capping here caps all of them together."""
    candidates = [
        {**h, "days_ago": 1, "fresh": True} for h in ctx["highlights"] if h.get("cue")
    ]
    candidates += [{**r, "fresh": False} for r in recall.quizzable(ctx["recall"])]

    items: list[dict] = []
    for c in candidates:
        if any(_too_alike(c["text"], kept["text"]) for kept in items):
            continue
        items.append(c)
    return items[:QUIZ_CAP]


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
            out.append(f"  {i}. {it['cue']}")
            for line in _sub_lines(it, answers=False):
                out.append(f"     ({line})")
        out += ["", "─" * 40, "", "ANSWERS", ""]
        for i, it in enumerate(items, 1):
            out.append(f"  {i}. {it['text']}")
            for line in _sub_lines(it, answers=True):
                out.append(f"     {line}")

    extra = _uncued(ctx)
    if extra:
        out += ["", "Also from yesterday", ""]
        for h in extra:
            out.append(f"  - {h['text']}")
            if source_of(h):
                out.append(f"    from {source_of(h)}")

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


def source_of(item: dict) -> str:
    """Where a quizzed line came from — the book and chapter, or the quest that
    carried it. Empty for anything stored before labels existed, which reads as no
    line at all rather than as a blank one."""
    return (item.get("source_label") or "").strip()


def _sub_lines(item: dict, answers: bool) -> list[str]:
    """The quiet lines under a quiz row. Both halves name the source: seeing it on
    the question is the context that makes a months-old cue answerable, and seeing it
    on the answer is what sends you back to the right chapter."""
    source = source_of(item)
    if not answers:
        when = "yesterday" if item["fresh"] else _ago(item["days_ago"])
        return [f"{when} · {source}" if source else when]
    lines = []
    if item.get("hook"):
        lines.append(f"hook: {item['hook']}")
    if source:
        lines.append(f"from {source}")
    return lines


def _numbered(items: list[dict], answers: bool) -> str:
    """The quiz, either as questions or as the answers to them. Same numbering both
    times — the number is the only thing tying an answer back to its question."""
    rows = []
    for i, it in enumerate(items, 1):
        body = it["text"] if answers else it["cue"]
        note = "".join(
            f'<div style="color:{_MUTED};font-size:12px;margin-top:4px">{line}</div>'
            for line in _sub_lines(it, answers)
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
                _li(h["text"], f"from {source_of(h)}" if source_of(h) else "")
                for h in extra
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
                f'{thread["title"]} · {thread["sittings"]} '
                f'sitting{"s" if thread["sittings"] != 1 else ""}</div>'
            )
        body += (
            f'<div style="background:{_BASE};border-radius:16px;padding:16px 18px;'
            f'margin-top:26px;color:{_TEXT};font-size:13px;line-height:1.5">'
            f'{FLESH_NUDGE}</div>'
        )

    return (
        f'<div style="background:{_BASE};padding:28px 16px;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif">'
        f'<div style="max-width:560px;margin:0 auto;background:{_CARD};'
        f'border-radius:28px;padding:28px">'
        f'{_masthead(ctx, avatar_src)}'
        f'{body}'
        f'<div style="border-top:1px solid {_HAIRLINE};margin-top:28px;padding-top:14px;'
        f'color:{_MUTED};font-size:12px">Showing up is the win. — Arise</div>'
        f'</div></div>'
    )