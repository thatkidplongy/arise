"""Optional LLM personalisation of quest content (Google Gemini).

Off by default: with no API key set, `enabled()` is False and callers fall back
to the handcrafted pools — the app behaves exactly as it does without an LLM.
When a key is present, `generate()` makes ONE call that returns personalised
content for a batch of slots. Any failure raises; the caller catches and falls
back, so the LLM can never break the app.

Config (environment variables):
  ARISE_LLM_API_KEY   Google AI Studio key (or GEMINI_API_KEY). Unset → disabled.
  ARISE_LLM_MODEL     default "gemini-flash-latest" — an alias that tracks the
                      current flash model, so a retired pinned version can't 404

Network I/O goes through `net`; only stdlib is used, so this works under launchd
without extra deps.
"""

import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from . import net

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


# ── The free tier's daily budget ─────────────────────────────────────────────
#
# Two things share one small allowance, and they are not equally important.
# Quest generation runs on every refresh — every tab you open — and degrades
# invisibly to the handcrafted pools when it can't run. The nightly distillation
# runs once and has no fallback at all: a day it misses is recall material that
# never comes to exist.
#
# So generation is capped short of the limit and the digest keeps a reserve, and
# a refusal that names a per-day quota stops both until the window rolls. Without
# that last part the failure is self-sustaining: nothing caches a failure, so
# every subsequent refresh asks again and is refused again, all day.

DAILY_LIMIT = int(os.environ.get("ARISE_LLM_DAILY_LIMIT", "20"))
# A digest is three calls — distil the day, rewrite the book's running sentence, then
# hook whatever older highlights are still missing one — and each retries twice
# against a burst limit. Nine is one whole morning. Finishing the lines an earlier cap
# cut short (digest.mend_clipped) is a fourth that comes out of whatever is left, and
# stops being asked for once the backlog is gone.
DIGEST_RESERVE = int(os.environ.get("ARISE_LLM_DIGEST_RESERVE", "9"))
# The free tier's window rolls at midnight Pacific, wherever the hunter is.
_QUOTA_TZ = ZoneInfo("America/Los_Angeles")

_spent: dict[str, int] = {}
_exhausted_day: str = ""

# The tally lives on disk as well as in memory. The deploy job restarts the backend
# on every backend commit, and a restart used to start the day's count from zero —
# a per-day refusal it had already learned was walked into again, and generation
# could spend the digest's reserve twice over. Beside arise.db (both are relative
# to the backend's working directory); a missing or unwritable file just means the
# tally is in memory only, as it always was.
_BUDGET_FILE = os.environ.get("ARISE_LLM_BUDGET_FILE", ".llm-budget.json")
_loaded = False


def _load() -> None:
    """Pick the tally back up after a restart. Once per process; a file that is
    missing, unreadable or malformed is treated as no tally at all."""
    global _loaded, _exhausted_day
    if _loaded:
        return
    _loaded = True
    try:
        with open(_BUDGET_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return
    if not isinstance(data, dict):
        return
    spent = data.get("spent")
    if isinstance(spent, dict):
        for day, n in spent.items():
            if isinstance(day, str) and isinstance(n, int) and not isinstance(n, bool):
                _spent[day] = n
    exhausted = data.get("exhausted_day")
    if isinstance(exhausted, str):
        _exhausted_day = exhausted


def _save() -> None:
    """Write the tally down. Atomic — a crash mid-write leaves the old file, not a
    torn one — and never fatal: a disk that won't take it costs nothing but the
    memory across the next restart."""
    try:
        tmp = _BUDGET_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"spent": _spent, "exhausted_day": _exhausted_day}, f)
        os.replace(tmp, _BUDGET_FILE)
    except OSError:
        pass


def quota_day() -> str:
    """Which allowance today's requests come out of."""
    return datetime.now(_QUOTA_TZ).date().isoformat()


def budget_left(reserve: int = 0) -> int:
    """Requests still safe to make, holding `reserve` back for something else."""
    _load()
    day = quota_day()
    if _exhausted_day == day:
        return 0
    return max(0, DAILY_LIMIT - reserve - _spent.get(day, 0))


def can_generate() -> bool:
    """Whether quest generation may run — false once it would eat the digest's
    share, so the one call with no fallback still has room."""
    return budget_left(DIGEST_RESERVE) > 0


def note_spend(n: int = 1) -> None:
    """Record requests made. Yesterday's tally is dropped, not accumulated."""
    _load()
    day = quota_day()
    for stale in [k for k in _spent if k != day]:
        del _spent[stale]
    _spent[day] = _spent.get(day, 0) + n
    _save()


def reset_budget() -> None:
    """Forget the tally, on disk too — for tests, and for a manual reset after
    topping up."""
    global _exhausted_day, _loaded
    _spent.clear()
    _exhausted_day = ""
    _loaded = True  # nothing to pick back up; a stale file must not be re-read
    try:
        os.remove(_BUDGET_FILE)
    except OSError:
        pass


def _error_body(err: Exception) -> str:
    """The provider's error text, read once and remembered: an HTTPError body is a
    stream, so a second reader would find it empty."""
    cached = getattr(err, "_arise_body", None)
    if cached is not None:
        return cached
    body = ""
    try:  # HTTPError is response-like; Google's error JSON carries no key
        raw = err.read()  # type: ignore[attr-defined]
        if raw:
            body = raw.decode("utf-8", "replace")
    except Exception:
        pass
    try:
        err._arise_body = body  # type: ignore[attr-defined]
    except Exception:
        pass
    return body


def note_refusal(err: Exception) -> None:
    """Learn from a 429 so it isn't walked into again.

    Only a per-day quota closes the window: a burst limit clears in seconds and
    must not be allowed to switch the model off for the rest of the day."""
    if getattr(err, "code", None) != 429:
        return
    body = _error_body(err)
    if "PerDay" in body or "per day" in body.lower():
        global _exhausted_day
        _load()
        _exhausted_day = quota_day()
        _save()

# Gemini structured-output schema (OpenAPI subset): one object per slot.
_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "quests": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "desc": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "string"}},
                    "resource": {"type": "string"},
                },
                "required": ["id", "title", "desc", "steps"],
            },
        }
    },
    "required": ["quests"],
}


def _api_key() -> str:
    return os.environ.get("ARISE_LLM_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""


def _model() -> str:
    # An alias that tracks the current flash model, so a retired pinned version
    # can't 404 us. Override with ARISE_LLM_MODEL to pin a specific one.
    return os.environ.get("ARISE_LLM_MODEL", "gemini-flash-latest")


def enabled() -> bool:
    """True only when an API key is configured. Everything else falls back."""
    return bool(_api_key())


def _require_budget() -> None:
    """Refuse before asking, for the callers that retry.

    Kept at the call site rather than inside `_ask` because it doesn't apply
    everywhere: generation is gated on `can_generate()` instead (it keeps clear of
    the digest's reserve), and the photo estimate isn't gated at all — the hunter
    is standing there looking at the screen. Only the retrying callers refuse up
    front, where asking anyway would spend three requests learning what's already
    known."""
    if budget_left() <= 0:
        raise RuntimeError(f"the day's model quota is spent (limit {DAILY_LIMIT})")


def _ask(parts: list[dict], schema: dict, temperature: float, timeout: float,
         retries: int = 0, spend: int = 0) -> dict:
    """One model call: `parts` in, the raw response payload out.

    Every caller asks the same way — JSON constrained to a schema, against the
    keyed endpoint for the configured model — and differs only in what it sends
    and how it pays. `retries` rides out the free tier's burst limit (429) and is
    for background work only; a caller that retries charges its whole worst case
    to `spend` before asking, so a burst can't overdraw the digest's reserve.

    Raises on any transport error; every caller lets that propagate to whoever
    decides what to do without the model."""
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    url = _ENDPOINT.format(model=_model()) + "?key=" + _api_key()
    if spend:
        note_spend(spend)
    return net.post_json(url, body, timeout=timeout, retries=retries)


def _build_prompt(slots: list[dict], profile: dict) -> str:
    lines = [
        "You write daily/weekly self-improvement quests for one person's personal",
        "'System' app (Solo Leveling inspired). Tone: a gentle guide, never a",
        "taskmaster — inviting, encouraging, no guilt. Make each quest CONCRETE and",
        "prescriptive: exact reps/sets/counts, named topics, specific prompts — never",
        "vague ('learn something'). Sequence learning to the person's stated level so",
        "each day is the next step. Each slot has a difficulty TIER and a BAND",
        "(foundation → building → depth): pitch the quest at that band. Fundamentals",
        "before the hard stuff — at the foundation band favour the basics (for",
        "learning, the craft of learning itself: active recall, mental mapping,",
        "the Feynman technique; for money, the psychology/principles before tactics),",
        "and only reach ambitious/advanced work at the depth band. The three bands are",
        "Shuhari: foundation is Shu — prescribe an established form (a named method,",
        "template or drill) to follow exactly as written, no improvising; building is",
        "Ha — a variation on that form, or a second form to compare it with; depth is",
        "Ri — the person designs their own approach. A higher tier means",
        "aim a little beyond last time — never stagnant. Keep 2–4 short steps. For learning quests add a",
        "'resource': ONE popular, genuinely well-known source (a real book with",
        "author, a real YouTube channel, or a trusted site) — else empty string.",
        "When a step's whole point is to write/reflect something down — a takeaway,",
        "a summary, a realization, a plan — phrase it beginning with 'Write down',",
        "'Note down', 'Reflect on', or 'Summarise', so the app can offer a place to",
        "write it. (A step that produces something else — code, a drawing, a recording",
        "— must NOT start with those words.)",
        "Do NOT include a mandatory 'floor' step (push-ups, read-a-chapter, etc.);",
        "the app adds those itself. Return only the requested slots.",
        "",
        "The person:",
        f"  Name: {profile.get('name') or 'the hunter'}",
    ]
    if profile.get("north_star"):
        lines.append(f"  North Star (their reason): {profile['north_star']}")
    if profile.get("current_book"):
        lines.append(f"  Currently reading: {profile['current_book']}")
    lines.append(
        "  Craft (CFT) is system thinking, design and architecture — not writing code."
        " Code generation is cheap now; the judgment isn't. If you write a Craft"
        " quest, make it reading/designing/critiquing systems, never a coding kata."
    )
    if profile.get("interview_mode"):
        lines.append(
            "  Interview prep mode is ON — for Craft (CFT) slots, favour interview"
            " work: DSA drills, mock system design, and behavioural (STAR) stories."
        )
    attrs = profile.get("attributes") or {}
    for stat, info in attrs.items():
        bits = []
        if info.get("focus"):
            bits.append("focus=" + ", ".join(info["focus"]))
        if info.get("level"):
            bits.append("where I'm at=" + info["level"])
        if info.get("tier") is not None:
            bits.append(f"tier={info['tier']} ({info.get('band', 'foundation')})")
        if bits:
            lines.append(f"  {stat}: " + "; ".join(bits))
    if profile.get("recent"):
        lines.append(f"  Recently completed: {profile['recent']}")

    lines.append("")
    lines.append("Slots to write (keep the same id, stat and cadence):")
    for s in slots:
        example = " / ".join(s.get("example_steps") or []) or s.get("example_desc", "")
        band = s.get("band", "foundation")
        lines.append(
            f"  - id={s['id']} stat={s['stat']} cadence={s['cadence']} "
            f"tier={s.get('tier', 0)} band={band} "
            f"theme='{s.get('theme', '')}' example: {example}"
        )
    lines.append("")
    lines.append("Return JSON: {\"quests\":[{id,title,desc,steps[],resource}]}.")
    return "\n".join(lines)


def generate(slots: list[dict], profile: dict, timeout: float = 20.0) -> dict[str, dict]:
    """One call → {quest_id: {title, desc, steps, resource}} for the given slots.

    Raises on any transport/parse error; the caller falls back to the pools."""
    if not slots:
        return {}
    payload = _ask(
        [{"text": _build_prompt(slots, profile)}],
        _RESPONSE_SCHEMA, 0.85, timeout, spend=1,
    )

    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(text)
    valid_ids = {s["id"] for s in slots}
    out: dict[str, dict] = {}
    for item in data.get("quests", []):
        qid = item.get("id")
        title = str(item.get("title", "")).strip()
        desc = str(item.get("desc", "")).strip()
        steps = [str(x).strip() for x in (item.get("steps") or []) if str(x).strip()]
        if qid in valid_ids and title and desc and steps:
            out[qid] = {
                "title": title,
                "desc": desc,
                "steps": steps,
                "resource": str(item.get("resource", "")).strip(),
            }
    return out


# ── Vision: estimate a meal's nutrition from a photo ─────────────────────────────

_ESTIMATE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "protein_p": {"type": "integer"},
        "veg_p": {"type": "integer"},
        "carb_p": {"type": "integer"},
        "extra_p": {"type": "integer"},
        "kcal": {"type": "integer"},
        "protein_g": {"type": "integer"},
        "fibre_g": {"type": "integer"},
        "note": {"type": "string"},
        "source": {"type": "string"},  # label | food | none
    },
    "required": ["name", "kcal", "protein_g", "fibre_g"],
}

# A plate comes back in hands, not calories. The person eating it can check a
# palm against their own hand and correct it in a second; they cannot check
# "620 kcal" against anything, so a wrong number there would just be logged.
_ESTIMATE_PROMPT = (
    "You read a photo for a personal food log that measures plates in HAND PORTIONS. "
    "The photo is EITHER a packaged food's Nutrition Facts label OR a plated meal.\n"
    "• If it is a plated meal: count the portions visible, using the eater's own hand "
    "as the ruler. protein_p = palms of meat/fish/egg/tofu/beans (a palm ≈ the size and "
    "thickness of their palm). veg_p = fists of non-starchy vegetables. carb_p = cupped "
    "hands of rice, noodles, bread, potato or other starch. extra_p = sweet drinks, "
    "desserts and deep-fried sides, counted one per item. Round to whole portions, and "
    "use 0 for anything not on the plate. Leave kcal, protein_g and fibre_g at 0 — this "
    "app does not want a calorie guess off a photo. Put the key assumption (how big the "
    "serving looks, oil you can see) in 'note'. Set source='food'.\n"
    "• If it is a nutrition label: READ the printed numbers exactly — do NOT guess. Use "
    "the PER-SERVING column for kcal, protein_g and fibre_g, leave every *_p at 0, and "
    "put the serving size and servings-per-container in 'note' (e.g. 'per serving "
    "(30 g); 4 servings per pack'). Set source='label'.\n"
    "• If it is neither: name 'Not food', zeros throughout, source='none'.\n"
    "Return JSON only: {name, protein_p, veg_p, carb_p, extra_p, kcal, protein_g, "
    "fibre_g, note, source}."
)


def _to_int(v) -> int:
    try:
        return max(0, round(float(v)))
    except (TypeError, ValueError):
        return 0


def _parse_estimate(payload: dict) -> dict:
    """Pure: Gemini response JSON → a normalised estimate dict. Testable offline."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(text)
    return {
        "name": str(data.get("name", "")).strip() or "Meal",
        "protein_p": _to_int(data.get("protein_p")),
        "veg_p": _to_int(data.get("veg_p")),
        "carb_p": _to_int(data.get("carb_p")),
        "extra_p": _to_int(data.get("extra_p")),
        "kcal": _to_int(data.get("kcal")),
        "protein_g": _to_int(data.get("protein_g")),
        "fibre_g": _to_int(data.get("fibre_g")),
        "note": str(data.get("note", "")).strip(),
        "source": str(data.get("source", "")).strip().lower(),  # label | food | none
    }


def analyze_food(image_b64: str, mime: str = "image/jpeg", timeout: float = 25.0) -> dict:
    """One Gemini vision call → a plate in hand portions (a meal) or the printed
    numbers (a label), for the user to correct before anything is logged.

    Raises on any transport/parse error; the route turns that into a clean message.
    Only called on demand (when the user snaps a photo), never in the background."""
    return _parse_estimate(_ask(
        [
            {"inline_data": {"mime_type": mime or "image/jpeg", "data": image_b64}},
            {"text": _ESTIMATE_PROMPT},
        ],
        _ESTIMATE_SCHEMA, 0.2, timeout,
    ))


# ── Distil a motivational transcript into takeaways + pull-quotes ────────────────

_DISTIL_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "takeaways": {"type": "array", "items": {"type": "string"}},
        "steps": {"type": "array", "items": {"type": "string"}},  # optional (tips only)
        "quotes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "takeaways", "quotes"],
}

_DISTIL_PROMPT = (
    "You distil a motivational video's transcript into something a person can keep, "
    "for a personal wellness app whose voice is a gentle guide — encouraging, never a "
    "drill sergeant. From the transcript, return:\n"
    "• summary: ONE warm sentence capturing the heart of it.\n"
    "• takeaways: 2–4 concrete, actionable lessons in a kind voice — each a short line "
    "the person could act on today (not vague platitudes).\n"
    "• quotes: 1–3 SHORT lines lifted (near-)verbatim from the transcript — the kind "
    "worth resurfacing as a daily nudge. Keep each under ~120 characters, faithful to "
    "the speaker's words, invent nothing. Skip filler ('follow my page', 'link below').\n"
    "If the transcript is empty or has no real substance, return empty arrays.\n"
    "Return JSON only: {summary, takeaways[], quotes[]}."
)


# What _clip leaves where it cut. A stored line ending in it was cut, and that is the
# one thing digest.mend_clipped looks for — so nothing else may append one.
CUT = "…"


def _clip(s, n: int) -> str:
    """Collapse whitespace and cap length — keeps stored lines tidy for display.

    Backs off to the last word boundary when the cap lands mid-word: "you only need
    to access or updat…" reads as a broken app, where a clean word plus an ellipsis
    reads as a line that ran long."""
    s = " ".join(str(s).split())
    if len(s) <= n:
        return s
    head = s[: n - 1]
    if not s[n - 1].isspace() and " " in head:
        head = head[: head.rindex(" ")]
    return head.rstrip(" ,;:·—-") + CUT


# Stored lengths for a distilled capture — runaway guards, not display budgets, the
# same rule the highlight caps below are sized by. The summary IS the card's header:
# the one line the Inspire list shows and the only part read when scanning, so a cap
# that fires on ordinary output cuts the card's title mid-clause. It was 220, which
# the tips prompt's own "1–2 plain sentences" overran routinely — a header ending
# "through handwriting, error tracking, and…" is what that looked like. Sized now so
# a full two-sentence summary always fits whole and only a runaway is cut.
MAX_SUMMARY = 500
# A takeaway/step is asked for as "a short line"; a quote is asked for as "under ~120
# characters". Both keep a guard above what the prompt asks for, so neither fires on
# output that obeyed it.
MAX_TAKEAWAY = 200
MAX_QUOTE = 160


def _parse_distillation(payload: dict) -> dict:
    """Pure: Gemini response JSON → {summary, takeaways[], steps[], quotes[]}. `steps`
    is optional (tips captures only; empty for motivation). Testable offline."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(text)
    takeaways = [_clip(x, MAX_TAKEAWAY) for x in (data.get("takeaways") or []) if str(x).strip()]
    steps = [_clip(x, MAX_TAKEAWAY) for x in (data.get("steps") or []) if str(x).strip()]
    quotes = [_clip(x, MAX_QUOTE) for x in (data.get("quotes") or []) if str(x).strip()]
    return {
        "summary": _clip(data.get("summary", ""), MAX_SUMMARY),
        "takeaways": takeaways[:6],
        "steps": steps[:6],
        "quotes": quotes[:3],
    }


_TIPS_PROMPT = (
    "You distil a how-to / advice video's transcript into keepable knowledge, for a "
    "personal wellness app with a warm, encouraging voice. This video is USEFUL "
    "INFORMATION, not motivation — capture the substance, not the vibe. From the "
    "transcript, return:\n"
    "• summary: 1–2 plain sentences capturing what this teaches and why it's worth "
    "keeping — enough to recall the gist later without rewatching.\n"
    "• takeaways: 2–6 key points worth remembering — the facts, principles or insights "
    "the video teaches. This is the important part: informational, not chores. Each a "
    "short clear line, no hype or filler.\n"
    "• steps: OPTIONAL — only if the video prescribes concrete actions to take. 0–6 "
    "short things the person could actually do, in a sensible order. If it's purely "
    "informational with nothing to act on, return an empty array. Never pad it.\n"
    "• quotes: return an empty array (this is a tips capture, not a motivational one).\n"
    "If the transcript is empty or has no real substance, return empty arrays.\n"
    "Return JSON only: {summary, takeaways[], steps[], quotes[]}."
)


def _distill(prompt: str, transcript: str, timeout: float) -> dict:
    """Shared Gemini call for a distillation → {summary, takeaways[], quotes[]}."""
    # Capture runs in the background, so we can afford to ride out Gemini's
    # free-tier burst limit (429) with a couple of retries rather than failing.
    return _parse_distillation(_ask(
        [
            {"text": prompt},
            {"text": "TRANSCRIPT:\n" + transcript.strip()},
        ],
        _DISTIL_SCHEMA, 0.4, timeout, retries=2,
    ))


def distill_motivation(transcript: str, timeout: float = 25.0) -> dict:
    """One Gemini call → {summary, takeaways[], quotes[]} from a motivational video.

    Raises on any transport/parse error; the caller surfaces a clean message. Called
    on demand when the user captures a video, never in the background."""
    return _distill(_DISTIL_PROMPT, transcript, timeout)


def distill_tips(transcript: str, timeout: float = 25.0) -> dict:
    """Like distill_motivation, but for a how-to video: takeaways are practical steps
    and quotes come back empty (nothing to resurface as a daily nudge)."""
    return _distill(_TIPS_PROMPT, transcript, timeout)


# Stored lengths for a distilled highlight. These are runaway guards, not display
# budgets: `text` IS the answer the morning email asks for and the card reread weeks
# later, so a cap tight enough to fire on an ordinary two-sentence idea silently ate
# the thing being recalled — the reader saw the question, guessed, and then couldn't
# tell whether they'd got it right. Sized so the model's own "one self-contained
# idea" always fits whole, and only genuinely runaway output is cut.
# The most a stored line may run to. The distiller is not told these — a highlight is
# whatever the idea takes, and the card grows with it — so they are a net against a
# runaway answer, not a target. Whatever they do cut is marked with CUT and written
# out in full on the next send (digest.mend_clipped): the cards were once cut hard at
# 240 characters with no word boundary, and a back ending "highly interconnect…" is
# what that looked like.
MAX_HIGHLIGHT_TEXT = 700
MAX_HIGHLIGHT_CUE = 300
# The hook prompt asks for a dozen to twenty words; the model runs to thirty often
# enough that 160 kept cutting one.
MAX_HOOK = 240


_LEARNING_SCHEMA = {
    "type": "object",
    "properties": {
        "highlights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "cue": {"type": "string"},
                    "hook": {"type": "string"},
                    "entry": {"type": "integer"},
                },
                "required": ["text", "cue", "hook", "entry"],
            },
        },
    },
    "required": ["highlights"],
}

_LEARNING_PROMPT = (
    "You turn a day's reading and learning into lines worth keeping, for a personal "
    "growth app with a warm, encouraging voice. These highlights are emailed back to "
    "the person the next morning, and again days and weeks later — so each one must "
    "still make sense read cold, months after the source is forgotten.\n"
    "You are given the ENTRIES for one day: what was read or learned, with the source "
    "and any notes the person wrote themselves.\n"
    "Return highlights: 5–10 lines across the WHOLE day, not per entry.\n"
    "• Each is one self-contained idea — the substance, not a description of it. "
    "Write 'Habits form through cue, craving, response, reward' — never 'the chapter "
    "explained how habits form'.\n"
    "• Lead with the person's own notes where they wrote any; those are what they "
    "actually took away. Keep their wording where it's already good.\n"
    "• When an entry names a source you genuinely know, cover BOTH: what they wrote, "
    "and the key ideas of that source they did not mention. Their notes are what they "
    "took away; the rest of the chapter is what they missed, and a highlight they "
    "never wrote down is the one worth being asked about later. Notes first, then the "
    "gaps.\n"
    "• For a source you do not genuinely know, work ONLY from the notes given. Never "
    "invent specifics — a vague source with no notes is worth fewer highlights, or "
    "none. Made-up detail is worse than a short digest.\n"
    "• Merge duplicates across entries; drop admin, feelings and filler. No hype, no "
    "numbering, no markdown.\n"
    "• An entry marked (reflection) is the person's own journal answer. Its SOURCE is "
    "the name of the prompt they were answering, never a published work — work only "
    "from their notes there, however familiar the name looks.\n"
    "If the entries are empty or have no real substance, return an empty array.\n"
    "\n"
    "Each highlight also carries a CUE and a HOOK.\n"
    "cue — the question this highlight is the answer to. It is asked days and weeks "
    "later, on its own, with the answer hidden: being asked and briefly failing is "
    "what fixes something in memory, so the cue must make the person actually "
    "retrieve.\n"
    "• Ask for the substance: 'What does the base rate tell you, and when is it "
    "ignored?' — never 'What did you read about base rates?'\n"
    "• Never leak the answer in the question. If the cue can be answered by reading "
    "it aloud, rewrite it.\n"
    "• No yes/no questions — they can be guessed with a coin.\n"
    "• Name enough context to be answerable cold months later. 'What are the four "
    "stages of a habit?' works; 'What were the four stages?' does not.\n"
    "hook — an ANALOGY that makes the answer easy to understand, on EVERY highlight. "
    "It is printed under the answer and never beside the question, so it can be as "
    "explicit as it likes without giving anything away.\n"
    "• The job is comprehension, not recall. Explain the answer as you would to a "
    "twelve-year-old, using something they already know: a queue at a shop, a fridge, "
    "traffic, a sock drawer, a group of friends. If someone read only the hook, they "
    "should understand what the answer MEANS.\n"
    "• It must be a comparison to something ELSE. A restatement in shorter words is "
    "not a hook — if it could be swapped for the answer and read the same, rewrite it.\n"
    "• Never a mnemonic, never wordplay, never a memory trick built out of the letters "
    "or sound of a term. Those help you parrot a phrase you still don't understand, "
    "which is the opposite of what this is for.\n"
    "• When the material is arbitrary — a list, a name, a number — do not force a "
    "clever device. Give the plainest everyday comparison that shows why those things "
    "belong together or what they are for.\n"
    "• Concrete and physical, one sentence, around a dozen to twenty words. Start it "
    "with 'Like ' whenever that reads naturally.\n"
    "entry — the number of the ENTRY this highlight came from. Every highlight files "
    "under its own source, so this must be the entry that actually carried the idea; "
    "for one merged from several, name the entry that contributed most. Never guess: "
    "a wrong number files the card under someone else's book.\n"
    'Return JSON only: {highlights:[{text, cue, hook, entry}]}.'
)


def _entry_index(value: object) -> int | None:
    """The model's 1-based ENTRY number as a 0-based index. None for anything that
    isn't a positive whole number — a bool, a float, a name it wrote instead."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value - 1 if value >= 1 else None


def _parse_learning(payload: dict) -> dict:
    """Pure: Gemini response JSON → {highlights[{text,cue,hook,entry}]}. Testable offline.

    A highlight with no usable text is dropped; one with no cue is kept but simply
    won't be quizzed, which beats inventing a question for it.

    `entry` is the 1-based ENTRY number the model attributed the line to, normalised
    to a 0-based index, or None when it came back missing or unparseable — the caller
    falls back to the day's own label rather than filing the card under a guess."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(text)
    out: list[dict] = []
    for item in data.get("highlights") or []:
        if not isinstance(item, dict):
            continue
        body = str(item.get("text") or "").strip()
        if not body:
            continue
        out.append({
            "text": _clip(body, MAX_HIGHLIGHT_TEXT),
            "cue": _clip(str(item.get("cue") or "").strip(), MAX_HIGHLIGHT_CUE),
            "hook": _clip(str(item.get("hook") or "").strip(), MAX_HOOK),
            "entry": _entry_index(item.get("entry")),
        })
    return {"highlights": out[:10]}


_HOOKS_SCHEMA = {
    "type": "object",
    "properties": {
        "hooks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "hook": {"type": "string"},
                },
                "required": ["n", "hook"],
            },
        },
    },
    "required": ["hooks"],
}

_HOOKS_PROMPT = (
    "You write explanatory analogies for lines someone already saved from their "
    "reading, for a personal growth app. They are quizzed on these lines by email, "
    "days and weeks apart, and the hook is printed under the answer — never beside the "
    "question — so it can be as explicit as it likes without giving anything away.\n"
    "You are given numbered FACTS: each an answer and the question it is asked as. "
    "Return one hook for every number, and change nothing else.\n"
    "• The job is comprehension, not recall. Explain the fact as you would to a "
    "twelve-year-old, using something they already know: a queue at a shop, a fridge, "
    "traffic, a sock drawer, a group of friends. If someone read only the hook, they "
    "should understand what the fact MEANS.\n"
    "• It must be a comparison to something ELSE. A restatement in shorter words is "
    "not a hook — if it could be swapped for the fact and read the same, rewrite it.\n"
    "• Never a mnemonic, never wordplay, never a memory trick built out of the letters "
    "or sound of a term. Those help you parrot a phrase you still don't understand, "
    "which is the opposite of what this is for.\n"
    "• When the fact is arbitrary — a list, a name, a number — do not force a clever "
    "device. Give the plainest everyday comparison that shows why those things belong "
    "together or what they are for.\n"
    "• Concrete and physical, one sentence, around a dozen to twenty words. Start it "
    "with 'Like ' whenever that reads naturally. Plain words, no markdown, no "
    "numbering inside the hook.\n"
    'Return JSON only: {hooks:[{n, hook}]}.'
)


def _parse_hooks(payload: dict) -> dict[int, str]:
    """Pure: Gemini response JSON → {number: hook}. Testable offline.

    Keyed by the number sent rather than by position: a model that skips one or
    reorders them would otherwise hang every hook on the wrong fact, which is worse
    than a fact with no hook at all."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    out: dict[int, str] = {}
    for item in json.loads(text).get("hooks") or []:
        if not isinstance(item, dict):
            continue
        try:
            n = int(item.get("n"))
        except (TypeError, ValueError):
            continue
        hook = _clip(str(item.get("hook") or "").strip(), MAX_HOOK)
        if hook:
            out[n] = hook
    return out


def hooks_for(facts: list[dict], timeout: float = 30.0) -> dict[int, str]:
    """One Gemini call → a hook per fact, keyed by its position in `facts` (1-based).

    For highlights distilled before every line carried a hook: they are asked for
    years, so it is worth one call to give them the same thing the fresh ones get.
    Raises on transport/parse failure; the caller sends the email without them."""
    numbered = "\n\n".join(
        f"{i}. FACT: {f.get('text') or ''}\n   ASKED AS: {f.get('cue') or ''}"
        for i, f in enumerate(facts, 1)
    )
    _require_budget()
    return _parse_hooks(_ask(
        [
            {"text": _HOOKS_PROMPT},
            {"text": "FACTS:\n" + numbered},
        ],
        # A hook is an invention; the distillation is not.
        _HOOKS_SCHEMA, 0.4, timeout, retries=2, spend=3,
    ))


# ── Finishing lines an earlier cap cut short ─────────────────────────────────

_FINISH_SCHEMA = {
    "type": "object",
    "properties": {
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "text": {"type": "string"},
                },
                "required": ["n", "text"],
            },
        },
    },
    "required": ["lines"],
}

_FINISH_PROMPT = (
    "You finish lines that were cut off, for a personal growth app's recall cards. "
    "Each numbered LINE was distilled from someone's reading and then cut mid-sentence "
    "by a length limit: it ends with an ellipsis where the cut fell. You are given what "
    "survived, what it was distilled from, and the question it answers. An ANALOGY is "
    "the line printed under an answer to explain it, and you are given that answer too.\n"
    "Return every line written out in full.\n"
    "• Keep everything before the ellipsis exactly as it is — the same words, spelling "
    "and punctuation, nothing added, dropped or moved — and continue from the cut, "
    "finishing a word that was split.\n"
    "• Finish the sentence and the thought the way the source itself would, in at most "
    "one or two more sentences. Invent nothing the source does not say; when unsure how "
    "it went on, close the sentence plainly rather than adding claims.\n"
    "• Plain words, no markdown, no numbering inside the line, and no ellipsis at the "
    "end of it.\n"
    'Return JSON only: {lines:[{n, text}]}.'
)

_LINE_KINDS = {"answer": "ANSWER", "analogy": "ANALOGY"}


def _format_lines(lines: list[dict]) -> str:
    """The cut lines as the prompt describes them: numbered, each with what survived
    and the card around it."""
    blocks = []
    for i, line in enumerate(lines, 1):
        kind = _LINE_KINDS.get(line.get("kind"), "LINE")
        parts = [f"{i}. {kind}, cut short: {line['head']}{CUT}"]
        if line.get("source"):
            parts.append(f"   FROM: {line['source']}")
        if line.get("cue"):
            parts.append(f"   ASKED AS: {line['cue']}")
        if line.get("answer"):
            parts.append(f"   THE ANSWER IT EXPLAINS: {line['answer']}")
        blocks.append("\n".join(parts))
    return "\n\n".join(blocks)


def _parse_finished(payload: dict, lines: list[dict]) -> dict[int, str]:
    """Pure: Gemini response JSON → {number: finished line}, keeping only a line that
    is the one sent with an ending added. Testable offline.

    The head has to come back verbatim: a card is in the reader's words, and a line
    "finished" by rewriting its start would swap what they kept for what the model
    preferred. A line still ending in the cut mark, or grown past its cap, is dropped
    too — kept, either would be sent up again tomorrow, and every day after."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    out: dict[int, str] = {}
    for item in json.loads(text).get("lines") or []:
        if not isinstance(item, dict):
            continue
        try:
            n = int(item.get("n"))
        except (TypeError, ValueError):
            continue
        if not 1 <= n <= len(lines):
            continue
        head, cap = lines[n - 1]["head"], lines[n - 1]["cap"]
        full = " ".join(str(item.get("text") or "").split())
        if not full.startswith(head) or len(full) <= len(head):
            continue
        if full.endswith(CUT) or len(full) > cap:
            continue
        out[n] = full
    return out


def finish_lines(lines: list[dict], timeout: float = 30.0) -> dict[int, str]:
    """One Gemini call → each cut-short line written out in full, keyed by its position
    in `lines` (1-based). A line is {kind, head, cap, source, cue, answer}: `head` is
    what survived the cut, without the mark; `cap` the most the finished line may run
    to; the rest is the card around it, for context.

    For cards written under an earlier, harder cap — 240 characters and no word
    boundary, so a back could end "highly interconnect…". They are asked for years,
    so one call to finish them is worth it. Raises on transport/parse failure; the
    caller leaves the cards as they are."""
    parts = [
        {"text": _FINISH_PROMPT},
        {"text": "LINES:\n" + _format_lines(lines)},
    ]
    _require_budget()
    # Temperature 0.2: the head is a copy and the ending is the source's.
    return _parse_finished(
        _ask(parts, _FINISH_SCHEMA, 0.2, timeout, retries=2, spend=3), lines,
    )


_THREAD_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}},
    "required": ["summary"],
}

_THREAD_PROMPT = (
    "You keep a single running sentence describing what someone has taken from a book "
    "so far, for a personal growth app.\n"
    "You are given the sentence as it stands (possibly empty, if this is the first "
    "reading) and the NEW ideas from the latest sitting.\n"
    "Return one sentence — the whole book so far, including the new material.\n"
    "• ONE sentence. Not two, not a list. The constraint is the point: fitting a "
    "growing pile of ideas into one line forces a decision about what actually "
    "matters and how the pieces connect.\n"
    "• Condense, never append. Do not bolt the new part onto the end of the old "
    "sentence — rewrite the whole thing so the ideas sit together. Older material "
    "gets compressed further to make room; that is correct, not lossy.\n"
    "• Say what the book claims, not what the reader did. 'Thinking is split between "
    "a fast intuitive system and a slow deliberate one, and most errors come from the "
    "first standing in for the second' — never 'they read about System 1 and 2'.\n"
    "• Plain words. No hype, no markdown, no naming the book.\n"
    'Return JSON only: {summary}.'
)


def thread_summary(title: str, previous: str, new_lines: list[str], timeout: float = 60.0) -> str:
    """One Gemini call → the running summary of `title`, rewritten to include today.

    Raises on transport/parse failure; the caller keeps the previous sentence rather
    than losing the thread over one bad morning."""
    parts = [
        f"BOOK: {title}",
        f"SENTENCE SO FAR: {previous or '(nothing yet — this is the first sitting)'}",
        "NEW IDEAS:\n" + "\n".join(f"- {ln}" for ln in new_lines),
    ]
    # Refused, the caller keeps the previous sentence — the right failure here.
    _require_budget()
    return _parse_thread(_ask(
        [{"text": _THREAD_PROMPT}, {"text": "\n\n".join(parts)}],
        _THREAD_SCHEMA, 0.3, timeout, retries=2, spend=3,
    ))


def _parse_thread(payload: dict) -> str:
    """Pure: Gemini response JSON → the one-sentence summary. Testable offline."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    return _clip(str(json.loads(text).get("summary") or "").strip(), 400)


def _format_entries(entries: list[dict]) -> str:
    """The day's entries as plain labelled text — one block per entry.

    Numbered from 1, because each highlight comes back naming the entry it was drawn
    from (see `entry` in _LEARNING_PROMPT) and that is what files it under the right
    book. The numbers are the model's only handle on them."""
    blocks: list[str] = []
    for n, e in enumerate(entries, start=1):
        parts = [f"ENTRY {n}", f"SOURCE: {e.get('source') or 'unspecified'} ({e.get('kind') or 'other'})"]
        note = (e.get("text") or "").strip()
        if note:
            parts.append(f"THEIR NOTES: {note}")
        blocks.append("\n".join(parts))
    return "\n\n".join(blocks)


def distill_learning(entries: list[dict], timeout: float = 30.0) -> dict:
    """One Gemini call → {highlights[]} for a whole day of learning.

    The day goes up in a single call rather than one per entry: it's cheaper, and it
    lets the model merge the same idea arriving from two sources. Raises on any
    transport/parse error; the caller decides what to do."""
    parts = [
        {"text": _LEARNING_PROMPT},
        {"text": "ENTRIES:\n" + _format_entries(entries)},
    ]
    # Refused, the digest logs the reason and sends the rest.
    _require_budget()
    # Runs from the nightly digest job, so a free-tier burst limit is worth waiting out.
    return _parse_learning(_ask(parts, _LEARNING_SCHEMA, 0.3, timeout, retries=2, spend=3))


def log_failure(err: Exception) -> None:
    """A generation failure is non-fatal (we fall back); note it and move on.

    Only the exception type (and HTTP status, if any) is logged — never the
    request URL, since it carries the API key as a query parameter."""
    note_refusal(err)
    detail = type(err).__name__
    code = getattr(err, "code", None)
    if code is not None:
        detail += f" {code}"
    raw = _error_body(err)[:1500]
    body = f" {raw}" if raw else ""
    shut = " Quota closed until it rolls; not asking again today." if _exhausted_day == quota_day() else ""
    print(f"[arise.llm] generation failed ({detail}); using pools.{shut}{body}", file=sys.stderr)
