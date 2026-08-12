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

from . import net

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

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
        "and only reach ambitious/advanced work at the depth band. A higher tier means",
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
    body = {
        "contents": [{"parts": [{"text": _build_prompt(slots, profile)}]}],
        "generationConfig": {
            "temperature": 0.85,
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
        },
    }
    url = _ENDPOINT.format(model=_model()) + "?key=" + _api_key()
    payload = net.post_json(url, body, timeout=timeout)

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
        "kcal": {"type": "integer"},
        "protein_g": {"type": "integer"},
        "fibre_g": {"type": "integer"},
        "note": {"type": "string"},
        "source": {"type": "string"},  # label | food | none
    },
    "required": ["name", "kcal", "protein_g", "fibre_g"],
}

_ESTIMATE_PROMPT = (
    "You read nutrition from a photo for a personal wellness app. The photo is EITHER "
    "a packaged food's Nutrition Facts label OR a plated meal.\n"
    "• If it is a nutrition label: READ the printed numbers exactly — do NOT guess. Use "
    "the PER-SERVING column, and put the serving size and servings-per-container in "
    "'note' (e.g. 'per serving (30 g); 4 servings per pack'). Set source='label'.\n"
    "• If it is a plated meal: estimate calories, protein and fibre for the portion "
    "actually visible, assuming typical preparation; put the key assumption (portion "
    "size, hidden oil) in 'note'. Set source='food'.\n"
    "• If it is neither: name 'Not food', zeros, source='none'.\n"
    "Give calories (kcal), protein (g) and fibre (g) as numbers. Return JSON only: "
    "{name, kcal, protein_g, fibre_g, note, source}."
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
        "kcal": _to_int(data.get("kcal")),
        "protein_g": _to_int(data.get("protein_g")),
        "fibre_g": _to_int(data.get("fibre_g")),
        "note": str(data.get("note", "")).strip(),
        "source": str(data.get("source", "")).strip().lower(),  # label | food | none
    }


def analyze_food(image_b64: str, mime: str = "image/jpeg", timeout: float = 25.0) -> dict:
    """One Gemini vision call → {name, kcal, protein_g, fibre_g, note} for a photo.

    Raises on any transport/parse error; the route turns that into a clean message.
    Only called on demand (when the user snaps a photo), never in the background."""
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": mime or "image/jpeg", "data": image_b64}},
            {"text": _ESTIMATE_PROMPT},
        ]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseSchema": _ESTIMATE_SCHEMA,
        },
    }
    url = _ENDPOINT.format(model=_model()) + "?key=" + _api_key()
    payload = net.post_json(url, body, timeout=timeout)
    return _parse_estimate(payload)


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


def _clip(s, n: int) -> str:
    """Collapse whitespace and cap length — keeps stored lines tidy for display."""
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _parse_distillation(payload: dict) -> dict:
    """Pure: Gemini response JSON → {summary, takeaways[], steps[], quotes[]}. `steps`
    is optional (tips captures only; empty for motivation). Testable offline."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(text)
    takeaways = [_clip(x, 200) for x in (data.get("takeaways") or []) if str(x).strip()]
    steps = [_clip(x, 200) for x in (data.get("steps") or []) if str(x).strip()]
    quotes = [_clip(x, 160) for x in (data.get("quotes") or []) if str(x).strip()]
    return {
        "summary": _clip(data.get("summary", ""), 220),
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
    body = {
        "contents": [{"parts": [
            {"text": prompt},
            {"text": "TRANSCRIPT:\n" + transcript.strip()},
        ]}],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
            "responseSchema": _DISTIL_SCHEMA,
        },
    }
    url = _ENDPOINT.format(model=_model()) + "?key=" + _api_key()
    # Capture runs in the background, so we can afford to ride out Gemini's
    # free-tier burst limit (429) with a couple of retries rather than failing.
    payload = net.post_json(url, body, timeout=timeout, retries=2)
    return _parse_distillation(payload)


def distill_motivation(transcript: str, timeout: float = 25.0) -> dict:
    """One Gemini call → {summary, takeaways[], quotes[]} from a motivational video.

    Raises on any transport/parse error; the caller surfaces a clean message. Called
    on demand when the user captures a video, never in the background."""
    return _distill(_DISTIL_PROMPT, transcript, timeout)


def distill_tips(transcript: str, timeout: float = 25.0) -> dict:
    """Like distill_motivation, but for a how-to video: takeaways are practical steps
    and quotes come back empty (nothing to resurface as a daily nudge)."""
    return _distill(_TIPS_PROMPT, transcript, timeout)


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
                },
                "required": ["text", "cue"],
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
    "If the entries are empty or have no real substance, return an empty array.\n"
    "\n"
    "Each highlight also carries a CUE and, sometimes, a HOOK.\n"
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
    "hook — a memory aid, ONLY when the fact is arbitrary: names, ordered lists, "
    "coined terms, numbers, anything where there is nothing to reason from.\n"
    "• A hook works by adding a THIRD thing that links the two you must connect — a "
    "concrete image or tiny story, not a restatement. To tie a term to its meaning, "
    "find something in the word itself that can be pictured, and picture it doing "
    "what the term means.\n"
    "• Make it vivid and physical. A picture you can see beats a clever phrase.\n"
    "• For an idea the person could re-derive by understanding it, return an empty "
    "string — a mnemonic competes with the understanding that would carry it anyway. "
    "Most highlights should have no hook.\n"
    'Return JSON only: {highlights:[{text, cue, hook}]}.'
)


def _parse_learning(payload: dict) -> dict:
    """Pure: Gemini response JSON → {highlights[{text,cue,hook}]}. Testable offline.

    A highlight with no usable text is dropped; one with no cue is kept but simply
    won't be quizzed, which beats inventing a question for it."""
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
            "text": _clip(body, 240),
            "cue": _clip(str(item.get("cue") or "").strip(), 200),
            "hook": _clip(str(item.get("hook") or "").strip(), 160),
        })
    return {"highlights": out[:10]}


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
    body = {
        "contents": [{"parts": [{"text": _THREAD_PROMPT}, {"text": "\n\n".join(parts)}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            "responseSchema": _THREAD_SCHEMA,
        },
    }
    url = _ENDPOINT.format(model=_model()) + "?key=" + _api_key()
    payload = net.post_json(url, body, timeout=timeout, retries=2)
    return _parse_thread(payload)


def _parse_thread(payload: dict) -> str:
    """Pure: Gemini response JSON → the one-sentence summary. Testable offline."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    return _clip(str(json.loads(text).get("summary") or "").strip(), 400)


def _format_entries(entries: list[dict]) -> str:
    """The day's entries as plain labelled text — one block per entry."""
    blocks: list[str] = []
    for e in entries:
        parts = [f"SOURCE: {e.get('source') or 'unspecified'} ({e.get('kind') or 'other'})"]
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
    body = {
        "contents": [{"parts": [
            {"text": _LEARNING_PROMPT},
            {"text": "ENTRIES:\n" + _format_entries(entries)},
        ]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            "responseSchema": _LEARNING_SCHEMA,
        },
    }
    url = _ENDPOINT.format(model=_model()) + "?key=" + _api_key()
    # Runs from the nightly digest job, so a free-tier burst limit is worth waiting out.
    payload = net.post_json(url, body, timeout=timeout, retries=2)
    return _parse_learning(payload)


def log_failure(err: Exception) -> None:
    """A generation failure is non-fatal (we fall back); note it and move on.

    Only the exception type (and HTTP status, if any) is logged — never the
    request URL, since it carries the API key as a query parameter."""
    detail = type(err).__name__
    code = getattr(err, "code", None)
    if code is not None:
        detail += f" {code}"
    body = ""
    try:  # HTTPError is response-like; Google's error JSON carries no key
        raw = err.read()  # type: ignore[attr-defined]
        if raw:
            body = " " + raw.decode("utf-8", "replace")[:1500]
    except Exception:
        pass
    print(f"[arise.llm] generation failed ({detail}); using pools.{body}", file=sys.stderr)
