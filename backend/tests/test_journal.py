"""Quest reflection notes → the dated Journal."""

DAY = "2026-07-18"
NEXT_DAY = "2026-07-19"


def _quest(state, qid):
    return next(q for q in state["quests"] if q["id"] == qid)


def test_reflective_quests_carry_a_prompt(client):
    s = client.get(f"/state?day={DAY}").json()
    # A quest whose requires_log flag is set invites a note, with its own prompt…
    assert _quest(s, "d-wealth")["note_prompt"] == "What did you learn or decide about money today?"
    assert _quest(s, "d-read")["note_prompt"]
    # …a quest without the flag doesn't.
    assert _quest(s, "d-train")["note_prompt"] == ""
    assert _quest(s, "d-train")["notes"] == []


def test_requires_log_flag_drives_the_prompt(client):
    """The flag lives on the quest row — flip it and the prompt follows (a default
    fills in when the row carries no prompt of its own)."""
    from app import state
    from app.db import SessionLocal
    from app.models import QuestDef

    client.get(f"/state?day={DAY}")  # ensure quests are seeded
    with SessionLocal() as db:
        q = db.get(QuestDef, "d-train")
        q.requires_log = True
        q.log_prompt = ""  # no custom prompt → default kicks in
        db.commit()

    s = client.get(f"/state?day={DAY}").json()
    # d-train now requires a log, shown with the default prompt.
    assert _quest(s, "d-train")["note_prompt"] == "Write down what you learned."
    # And it can hold a note like any log quest.
    s = client.post("/quest-notes", json={"quest_id": "d-train", "text": "logged it", "day": DAY}).json()
    assert _quest(s, "d-train")["notes"][0]["text"] == "logged it"


def test_note_saves_shows_on_quest_and_journal(client):
    s = client.post("/quest-notes", json={
        "quest_id": "d-wealth", "text": "Rich is income; wealthy is assets that pay you.", "day": DAY,
    }).json()

    # It attaches to that quest for the day…
    notes = _quest(s, "d-wealth")["notes"]
    assert [n["text"] for n in notes] == ["Rich is income; wealthy is assets that pay you."]

    # …and lands in the dated Journal, tagged with the quest's attribute.
    assert len(s["reflections"]) == 1
    entry = s["reflections"][0]
    assert entry["stat"] == "WLT" and entry["day"] == DAY
    assert entry["quest_id"] == "d-wealth"

    # Notes are standalone — they never touch XP.
    assert s["player"]["total_xp"] == 0


def test_notes_are_scoped_to_the_quest_period(client):
    client.post("/quest-notes", json={"quest_id": "d-read", "text": "day one", "day": DAY})
    # A different day is a different daily period — the note doesn't leak into it.
    s = client.get(f"/state?day={NEXT_DAY}").json()
    assert _quest(s, "d-read")["notes"] == []
    # But the Journal keeps it (it's a history across all days).
    assert [e["text"] for e in s["reflections"]] == ["day one"]


def test_note_rejects_empty(client):
    r = client.post("/quest-notes", json={"quest_id": "d-read", "text": "", "day": DAY})
    assert r.status_code == 422


def test_note_edit_in_place(client):
    s = client.post("/quest-notes", json={"quest_id": "d-read", "text": "rough draft", "day": DAY}).json()
    nid = s["reflections"][0]["id"]
    # Editing keeps the same note (Markdown allowed), doesn't create a new one.
    s = client.post(f"/quest-notes/{nid}", json={"text": "**Polished** takeaway", "day": DAY}).json()
    assert len(s["reflections"]) == 1
    assert s["reflections"][0]["text"] == "**Polished** takeaway"
    assert _quest(s, "d-read")["notes"][0]["text"] == "**Polished** takeaway"


def test_note_delete(client):
    s = client.post("/quest-notes", json={"quest_id": "d-read", "text": "keep? no", "day": DAY}).json()
    nid = s["reflections"][0]["id"]
    s = client.request("DELETE", f"/quest-notes/{nid}?day={DAY}").json()
    assert s["reflections"] == []
    assert _quest(s, "d-read")["notes"] == []


def test_newest_reflection_comes_first(client):
    client.post("/quest-notes", json={"quest_id": "d-read", "text": "first", "day": DAY})
    s = client.post("/quest-notes", json={"quest_id": "d-wealth", "text": "second", "day": NEXT_DAY}).json()
    assert [e["text"] for e in s["reflections"]] == ["second", "first"]


# ── Free-form daily journal (unlinked to any quest) ───────────────────────────


def test_free_journal_add_edit_delete(client):
    assert client.get(f"/state?day={DAY}").json()["journal"] == []

    s = client.post("/journal", json={"text": "Woke up clear-headed. **Good day** ahead.", "day": DAY}).json()
    assert len(s["journal"]) == 1
    entry = s["journal"][0]
    assert entry["text"] == "Woke up clear-headed. **Good day** ahead." and entry["day"] == DAY
    # It's its own thing — no quest link, no XP.
    assert "quest_id" not in entry
    assert s["player"]["total_xp"] == 0

    eid = entry["id"]
    s = client.post(f"/journal/{eid}", json={"text": "edited", "day": DAY}).json()
    assert s["journal"][0]["text"] == "edited"

    s = client.request("DELETE", f"/journal/{eid}?day={DAY}").json()
    assert s["journal"] == []


def test_free_journal_is_separate_from_reflections(client):
    client.post("/journal", json={"text": "free thought", "day": DAY})
    client.post("/quest-notes", json={"quest_id": "d-read", "text": "quest takeaway", "day": DAY})
    s = client.get(f"/state?day={DAY}").json()
    assert [e["text"] for e in s["journal"]] == ["free thought"]
    assert [r["text"] for r in s["reflections"]] == ["quest takeaway"]


def test_free_journal_allows_multiple_per_day_newest_first(client):
    client.post("/journal", json={"text": "morning", "day": DAY})
    s = client.post("/journal", json={"text": "evening", "day": DAY}).json()
    assert [e["text"] for e in s["journal"]] == ["evening", "morning"]


def test_free_journal_rejects_empty(client):
    assert client.post("/journal", json={"text": "", "day": DAY}).status_code == 422
    # Whitespace-only passes validation but is trimmed to nothing — no entry added.
    client.post("/journal", json={"text": "   ", "day": DAY})
    assert client.get(f"/state?day={DAY}").json()["journal"] == []
