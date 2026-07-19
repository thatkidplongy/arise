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
    """Pure: Gemini response JSON → {summary, takeaways[], quotes[]}. Testable offline."""
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(text)
    takeaways = [_clip(x, 200) for x in (data.get("takeaways") or []) if str(x).strip()]
    quotes = [_clip(x, 160) for x in (data.get("quotes") or []) if str(x).strip()]
    return {
        "summary": _clip(data.get("summary", ""), 200),
        "takeaways": takeaways[:4],
        "quotes": quotes[:3],
    }


_TIPS_PROMPT = (
    "You distil a how-to / advice video's transcript into a practical playbook a "
    "person can act on, for a personal wellness app with a warm, encouraging voice. "
    "This video is USEFUL INFORMATION, not motivation — capture the substance, not the "
    "vibe. From the transcript, return:\n"
    "• summary: 1–2 plain sentences capturing what this teaches and why it's worth "
    "keeping — enough to recall the gist later without rewatching.\n"
    "• takeaways: 2–6 concrete, actionable steps or tips — each a short line the person "
    "could actually do, specific and in a sensible order, no hype or filler.\n"
    "• quotes: return an empty array (this is a tips capture, not a motivational one).\n"
    "If the transcript is empty or has no real substance, return empty arrays.\n"
    "Return JSON only: {summary, takeaways[], quotes[]}."
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
