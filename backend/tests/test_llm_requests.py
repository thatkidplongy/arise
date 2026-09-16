"""What each model caller actually puts on the wire.

Characterisation, not correctness: these pin the request every caller in `llm`
sends today — endpoint, prompt parts, temperature, schema, retries, and what it
charges the day's budget. The seven call sites were hand-rolled copies of the
same six lines, and the things that differ between them (0.2 vs 0.85, retries or
not, three units or one) are exactly the things a careless extraction quietly
swaps. Nothing here asserts a value is *right* — only that it hasn't moved.
"""

import pytest

from app import llm, net


@pytest.fixture
def sent(monkeypatch):
    """Capture the request instead of making it, and answer with a fixed payload.

    The payload has to satisfy every caller's parser, so it carries one of each
    shape the seven of them read back.
    """
    calls: list[dict] = []

    reply = {
        "quests": [{"id": "d-train", "title": "T", "desc": "D", "steps": ["s"]}],
        "name": "Meal", "kcal": 1, "protein_g": 1, "fibre_g": 1,
        "summary": "S", "takeaways": ["t"], "quotes": ["q"],
        "hooks": [{"n": 1, "hook": "h"}],
        "lines": [{"n": 1, "text": "finished"}],
        "facts": [{"text": "f", "cue": "c", "hook": "h"}],
    }

    def _capture(url, body, headers=None, timeout=20.0, retries=0, backoff=2.0):
        calls.append({"url": url, "body": body, "timeout": timeout, "retries": retries})
        import json as _json
        return {"candidates": [{"content": {"parts": [{"text": _json.dumps(reply)}]}}]}

    monkeypatch.setattr(net, "post_json", _capture)
    monkeypatch.setenv("ARISE_LLM_API_KEY", "test-key")
    monkeypatch.setenv("ARISE_LLM_MODEL", "test-model")
    return calls


def _texts(call: dict) -> list[str]:
    """The text parts of a request, in order."""
    parts = call["body"]["contents"][0]["parts"]
    return [p["text"] for p in parts if "text" in p]


def _config(call: dict) -> dict:
    return call["body"]["generationConfig"]


ENDPOINT = ("https://generativelanguage.googleapis.com/v1beta/models/"
            "test-model:generateContent?key=test-key")


def test_every_caller_posts_to_the_same_keyed_endpoint(sent):
    llm.generate([{"id": "d-train", "stat": "STR", "cadence": "daily"}], {})
    llm.analyze_food("aGk=")
    llm.distill_motivation("a transcript")
    llm.distill_tips("a transcript")
    llm.hooks_for([{"text": "f", "cue": "c"}])
    llm.finish_lines([{"kind": "answer", "head": "highly interconnect", "cap": 240}])
    llm.thread_summary("DDIA", "so far", ["new"])
    llm.distill_learning([{"kind": "book", "source": "DDIA", "text": "notes"}])

    assert len(sent) == 8
    assert {c["url"] for c in sent} == {ENDPOINT}
    # Every request asks for JSON against a schema — that's what lets the parsers
    # read fields by name rather than scraping prose.
    for call in sent:
        assert _config(call)["responseMimeType"] == "application/json"
        assert "responseSchema" in _config(call)


def test_generate_sends_one_prompt_at_pool_temperature(sent):
    llm.generate([{"id": "d-train", "stat": "STR", "cadence": "daily"}], {})

    assert len(_texts(sent[0])) == 1  # prompt and slots built into one block
    assert "d-train" in _texts(sent[0])[0]
    assert _config(sent[0])["temperature"] == 0.85
    assert _config(sent[0])["responseSchema"] is llm._RESPONSE_SCHEMA
    assert sent[0]["retries"] == 0  # a refresh falls back to the pools instead
    assert sent[0]["timeout"] == 20.0


def test_generate_asks_for_nothing_when_there_are_no_slots(sent):
    assert llm.generate([], {}) == {}
    assert sent == []


def test_analyze_food_sends_the_image_before_the_prompt(sent):
    llm.analyze_food("aGk=", mime="image/png")

    parts = sent[0]["body"]["contents"][0]["parts"]
    assert parts[0]["inline_data"] == {"mime_type": "image/png", "data": "aGk="}
    assert parts[1]["text"] is llm._ESTIMATE_PROMPT
    assert _config(sent[0])["temperature"] == 0.2
    assert _config(sent[0])["responseSchema"] is llm._ESTIMATE_SCHEMA
    assert sent[0]["retries"] == 0  # on demand: the user is waiting on it
    assert sent[0]["timeout"] == 25.0


def test_analyze_food_defaults_a_blank_mime_to_jpeg(sent):
    llm.analyze_food("aGk=", mime="")
    parts = sent[0]["body"]["contents"][0]["parts"]
    assert parts[0]["inline_data"]["mime_type"] == "image/jpeg"


def test_both_distillations_share_a_call_and_differ_only_in_prompt(sent):
    llm.distill_motivation("  spoken words  ")
    llm.distill_tips("  spoken words  ")

    for call in sent:
        assert _texts(call)[1] == "TRANSCRIPT:\nspoken words"  # trimmed
        assert _config(call)["temperature"] == 0.4
        assert _config(call)["responseSchema"] is llm._DISTIL_SCHEMA
        assert call["retries"] == 2  # background work rides out a burst limit
        assert call["timeout"] == 25.0

    assert _texts(sent[0])[0] is llm._DISTIL_PROMPT
    assert _texts(sent[1])[0] is llm._TIPS_PROMPT


def test_hooks_are_asked_for_by_number(sent):
    llm.hooks_for([
        {"text": "Depth beats speed.", "cue": "What beats speed?"},
        {"text": "Sleep consolidates.", "cue": ""},
    ])

    prompt, facts = _texts(sent[0])
    assert prompt is llm._HOOKS_PROMPT
    assert facts.startswith("FACTS:\n1. FACT: Depth beats speed.")
    assert "2. FACT: Sleep consolidates." in facts
    assert _config(sent[0])["temperature"] == 0.4
    assert _config(sent[0])["responseSchema"] is llm._HOOKS_SCHEMA
    assert sent[0]["retries"] == 2
    assert sent[0]["timeout"] == 30.0


def test_finish_lines_sends_the_cut_lines_with_their_context(sent):
    llm.finish_lines([{"kind": "answer", "head": "highly interconnect", "cap": 240}])

    prompt, lines = _texts(sent[0])
    assert prompt is llm._FINISH_PROMPT
    assert lines.startswith("LINES:\n")
    assert "highly interconnect" in lines
    assert _config(sent[0])["temperature"] == 0.2  # the head is copied verbatim
    assert _config(sent[0])["responseSchema"] is llm._FINISH_SCHEMA
    assert sent[0]["retries"] == 2
    assert sent[0]["timeout"] == 30.0


def test_thread_summary_sends_the_book_the_sentence_and_the_new_ideas(sent):
    llm.thread_summary("DDIA", "so far", ["idea one", "idea two"])

    prompt, body = _texts(sent[0])
    assert prompt is llm._THREAD_PROMPT
    assert body.startswith("BOOK: DDIA\n\nSENTENCE SO FAR: so far")
    assert "- idea one\n- idea two" in body
    assert _config(sent[0])["temperature"] == 0.3
    assert _config(sent[0])["responseSchema"] is llm._THREAD_SCHEMA
    assert sent[0]["retries"] == 2
    assert sent[0]["timeout"] == 60.0


def test_thread_summary_says_so_when_it_is_the_first_sitting(sent):
    llm.thread_summary("DDIA", "", ["idea one"])
    assert "(nothing yet — this is the first sitting)" in _texts(sent[0])[1]


def test_distill_learning_sends_the_whole_day_in_one_call(sent):
    llm.distill_learning([
        {"kind": "book", "source": "DDIA", "text": "notes"},
        {"kind": "article", "source": "a post", "text": "more"},
    ])

    prompt, entries = _texts(sent[0])
    assert prompt is llm._LEARNING_PROMPT
    assert entries.startswith("ENTRIES:\n")
    assert "DDIA" in entries and "a post" in entries
    assert _config(sent[0])["temperature"] == 0.3
    assert _config(sent[0])["responseSchema"] is llm._LEARNING_SCHEMA
    assert sent[0]["retries"] == 2
    assert sent[0]["timeout"] == 30.0


# ── What each call charges the day's allowance ───────────────────────────────
#
# The retrying callers charge three units up front (one attempt plus its two
# retries) so a burst of retries can't overdraw the digest's reserve. Generation
# charges one. The on-demand photo estimate charges nothing at all — losing it
# would be a fair trade for the day's recall material, and it only ever runs when
# the hunter is standing there looking at the screen.

@pytest.mark.parametrize("call,charged", [
    (lambda: llm.generate([{"id": "d-train", "stat": "STR", "cadence": "daily"}], {}), 1),
    (lambda: llm.analyze_food("aGk="), 0),
    (lambda: llm.distill_motivation("t"), 0),
    (lambda: llm.hooks_for([{"text": "f", "cue": "c"}]), 3),
    (lambda: llm.finish_lines([{"kind": "answer", "head": "highly interconnect", "cap": 240}]), 3),
    (lambda: llm.thread_summary("DDIA", "", ["new"]), 3),
    (lambda: llm.distill_learning([{"kind": "book", "source": "S", "text": "n"}]), 3),
])
def test_what_each_call_charges_the_budget(sent, call, charged):
    before = llm.budget_left()
    call()
    assert before - llm.budget_left() == charged


@pytest.mark.parametrize("call", [
    lambda: llm.hooks_for([{"text": "f", "cue": "c"}]),
    lambda: llm.finish_lines([{"kind": "answer", "head": "highly interconnect", "cap": 240}]),
    lambda: llm.thread_summary("DDIA", "", ["new"]),
    lambda: llm.distill_learning([{"kind": "book", "source": "S", "text": "n"}]),
])
def test_the_digest_calls_check_the_budget_before_asking(sent, call):
    """Asking anyway would spend three requests learning what's already known."""
    llm.note_spend(llm.DAILY_LIMIT)
    with pytest.raises(RuntimeError, match="quota is spent"):
        call()
    assert sent == []  # nothing left the machine
