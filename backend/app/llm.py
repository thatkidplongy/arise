"""Optional LLM personalisation of quest content (Google Gemini).

Off by default: with no API key set, `enabled()` is False and callers fall back
to the handcrafted pools — the app behaves exactly as it does without an LLM.
When a key is present, `generate()` makes ONE call that returns personalised
content for a batch of slots. Any failure raises; the caller catches and falls
back, so the LLM can never break the app.

Config (environment variables):
  ARISE_LLM_API_KEY   Google AI Studio key (or GEMINI_API_KEY). Unset → disabled.
  ARISE_LLM_MODEL     default "gemini-2.0-flash" (free tier)

Only stdlib is used (urllib) so this works under launchd without extra deps.
"""

import json
import os
import sys
import urllib.error
import urllib.request

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
    return os.environ.get("ARISE_LLM_MODEL", "gemini-2.0-flash")


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
        "each day is the next step. Keep 2–4 short steps. For learning quests add a",
        "'resource': ONE popular, genuinely well-known source (a real book with",
        "author, a real YouTube channel, or a trusted site) — else empty string.",
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
    attrs = profile.get("attributes") or {}
    for stat, info in attrs.items():
        bits = []
        if info.get("focus"):
            bits.append("focus=" + ", ".join(info["focus"]))
        if info.get("level"):
            bits.append("where I'm at=" + info["level"])
        if bits:
            lines.append(f"  {stat}: " + "; ".join(bits))
    if profile.get("recent"):
        lines.append(f"  Recently completed: {profile['recent']}")

    lines.append("")
    lines.append("Slots to write (keep the same id, stat and cadence):")
    for s in slots:
        example = " / ".join(s.get("example_steps") or []) or s.get("example_desc", "")
        lines.append(
            f"  - id={s['id']} stat={s['stat']} cadence={s['cadence']} "
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
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)

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
            body = " " + raw.decode("utf-8", "replace")[:300]
    except Exception:
        pass
    print(f"[arise.llm] generation failed ({detail}); using pools.{body}", file=sys.stderr)
