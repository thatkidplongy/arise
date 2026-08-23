"""Unit tests for the Open Library parsers (pure, no network)."""

from app import books, reading


def test_reading_progress_counts_the_chapters_you_logged(client):
    day = "2026-07-18"
    assert client.get(f"/state?day={day}").json()["reading"] is None  # no book yet

    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 20})
    r = client.get(f"/state?day={day}").json()["reading"]
    assert r["book"] == "Atomic Habits" and r["chapters"] == 20 and r["measure"] == "chapters"
    assert r["chapters_read"] == 0 and r["progress"] == 0.0 and r["done_today"] is False

    # Logging what you actually read is what moves the book along.
    r = client.post("/reading/log", json={"chapters": 3, "label": "1–3", "day": day}).json()["reading"]
    assert r["chapters_read"] == 3 and r["progress"] == 0.15 and r["done_today"] is True
    assert [e["label"] for e in r["logged_today"]] == ["1–3"]

    # Reading on means the furthest chapter reached, not a running sum of sittings.
    r = client.post("/reading/log", json={"chapters": 2, "label": "4–5", "day": day}).json()["reading"]
    assert r["chapters_read"] == 5 and len(r["logged_today"]) == 2

    # And a mistyped one can be taken back.
    log_id = r["logged_today"][1]["id"]
    r = client.delete(f"/reading/log/{log_id}?day={day}").json()["reading"]
    assert r["chapters_read"] == 3 and len(r["logged_today"]) == 1


def test_progress_is_where_you_are_in_the_book_not_how_much_you_logged(client):
    """Joining a book mid-way is the common case — someone who reads ch 21–22 of 35
    is 22 chapters in, not 2, and the bar has to say so."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Thinking, Fast and Slow", "chapters": 35})

    r = client.post("/reading/log", json={"chapters": 2, "label": "21-22", "day": day}).json()["reading"]
    assert r["chapters_read"] == 22 and r["progress"] == 0.629
    # The sitting itself is still recorded truthfully as the two chapters it was.
    assert r["logged_today"][0]["chapters"] == 2


def test_a_bare_count_still_moves_progress_and_is_never_wound_back(client):
    """Counts with no chapter names are a floor: naming a low chapter afterwards
    must not undo chapters already logged."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Some Book", "chapters": 30})

    r = client.post("/reading/log", json={"chapters": 6, "label": "", "day": day}).json()["reading"]
    assert r["chapters_read"] == 6

    r = client.post("/reading/log", json={"chapters": 1, "label": "ch 2", "day": day}).json()["reading"]
    assert r["chapters_read"] == 7  # 6 counted + this one, not back to 2


def test_book_key_strips_chapter_markers():
    """Every sitting on one book must land on the same thread, however it was typed."""
    assert reading.book_key("Deep Work, ch 2") == "deep work"
    assert reading.book_key("Deep Work ch. 2-3") == "deep work"
    assert reading.book_key("Deep Work pp 40-52") == "deep work"
    assert reading.book_key("Deep Work") == "deep work"
    assert reading.book_key("Thinking, Fast and Slow, chapter 4") == "thinking, fast and slow"


def test_book_key_keeps_a_number_that_is_part_of_the_title():
    assert reading.book_key("Catch 22") == "catch 22"


def test_book_name_keeps_the_title_as_written():
    """It is what the panel shows, so the casing has to survive the stripping."""
    assert reading.book_name("Thinking, fast and slow, ch 31-32") == "Thinking, fast and slow"
    assert reading.book_name("Deep Work pp 40-52") == "Deep Work"
    assert reading.book_name("Catch 22") == "Catch 22"


def test_furthest_chapter_reads_a_label_the_way_a_reader_would():
    assert reading.furthest_chapter("21-22") == 22
    assert reading.furthest_chapter("ch 5 – 7") == 7
    assert reading.furthest_chapter("3, 5, 8") == 8
    assert reading.furthest_chapter("12") == 12
    assert reading.furthest_chapter("the intro") == 0
    assert reading.furthest_chapter("") == 0
    # A stray number can't put you past the last chapter of a book we know.
    assert reading.furthest_chapter("published 2011", total=35) == 35
    assert reading.furthest_chapter("published 2011") == 2011  # nothing to clamp to


def test_a_book_with_no_length_gets_a_count_and_no_deadline(client):
    """Without a chapter count there is nothing to be a fraction of. It used to
    borrow a days target from the reading level, which quietly expected a better
    reader to finish sooner — the app setting the pace, one last time."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Some Book"})  # no chapter count
    r = client.get(f"/state?day={day}").json()["reading"]
    assert r["measure"] == "count" and r["progress"] == 0.0
    assert "days_to_finish" not in r

    # Logging still records what you read; it just isn't measured against anything.
    r = client.post("/reading/log", json={"chapters": 3, "label": "1–3", "day": day}).json()["reading"]
    assert r["chapters_read"] == 3 and r["measure"] == "count" and r["progress"] == 0.0


def test_a_book_with_no_length_is_never_asked_about(client):
    """Nothing can tell the app you've finished it, so it never presumes to ask —
    finishing is something only the hunter can say."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Some Book"})
    for i in range(30):
        client.post("/reading/log", json={"chapters": 1, "label": str(i + 1), "day": day})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is False

    # But saying so still works, and rolls to the next book. The response is an
    # ActionResult now — the review can unlock an achievement, so it answers with
    # events alongside the state rather than the state alone.
    body = client.post(f"/book/review?day={day}", json={"finished": True, "next_book": "Next"}).json()
    player = body["state"]["player"]
    assert player["books_finished"] == 1 and player["current_book"] == "Next"
    # Unasked-about or not, finishing it still earns the achievement.
    assert [e["data"]["id"] for e in body["events"] if e["type"] == "achievement"] == ["book-1"]


def test_finishing_the_chapters_triggers_the_check_in(client):
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Short Book", "chapters": 4})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is False

    body = client.post("/reading/log", json={"chapters": 4, "label": "1–4", "day": day}).json()
    assert body["reading"]["progress"] == 1.0
    assert body["book_review"] == {"pending": True, "book": "Short Book"}


def test_changing_books_does_not_inherit_the_last_ones_chapters(client):
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "First Book", "chapters": 10})
    client.post("/reading/log", json={"chapters": 6, "label": "1–6", "day": day})

    r = client.put(f"/book?day={day}", json={"current_book": "Second Book", "chapters": 10}).json()["reading"]
    assert r["chapters_read"] == 0 and r["logged_today"] == []


def _book_started_week(client) -> str:
    from app.db import SessionLocal
    from app.models import Player

    session = SessionLocal()
    try:
        return session.query(Player).first().book_started_week
    finally:
        session.close()


def test_fixing_a_books_chapter_count_keeps_the_history_it_already_has(client):
    """Correcting a length is not starting over.

    The only UI path to a book's chapter total is this same save, so re-saving the
    title you're already reading has to leave `book_started_week` where it is —
    moving it to this week drops every earlier sitting and read day out of the
    window progress is counted in. Real data: "Thinking, fast and slow" fixed from
    35 to 38 chapters came back as 2 days read instead of 13."""
    start, later = "2026-07-14", "2026-07-27"  # W29, then W31 — the book runs on
    client.put(f"/book?day={start}", json={"current_book": "Thinking, fast and slow", "chapters": 35})
    for day in (start, "2026-07-16", later):
        client.post("/reading/log", json={"chapters": 4, "label": "", "day": day})
        client.post("/completions", json={"quest_id": "d-read", "day": day})

    before = client.get(f"/state?day={later}").json()["reading"]
    assert before["chapters_read"] == 12 and before["days_read"] == 3
    assert _book_started_week(client) == "2026-W29"

    # The fix: same book, right length. Everything but the total holds.
    r = client.put(f"/book?day={later}", json={"current_book": "Thinking, fast and slow", "chapters": 38}).json()
    assert r["reading"]["chapters"] == 38
    assert r["reading"]["chapters_read"] == 12 and r["reading"]["days_read"] == 3
    assert _book_started_week(client) == "2026-W29"


def test_retyping_the_same_title_differently_is_not_a_new_book(client):
    """Capitalisation isn't identity. The sittings are keyed on the title as it stood
    when logged, so they come along with the corrected spelling rather than reading
    as a book with no progress."""
    start, later = "2026-07-14", "2026-07-27"
    client.put(f"/book?day={start}", json={"current_book": "atomic habits", "chapters": 20})
    client.post("/reading/log", json={"chapters": 5, "label": "1-5", "day": start})
    client.post("/completions", json={"quest_id": "d-read", "day": start})

    r = client.put(f"/book?day={later}", json={"current_book": "  Atomic Habits ", "chapters": 20}).json()
    assert r["player"]["current_book"] == "Atomic Habits"  # what they typed, kept
    assert r["reading"]["chapters_read"] == 5 and r["reading"]["days_read"] == 1
    assert _book_started_week(client) == "2026-W29"


def test_a_genuinely_new_book_still_starts_its_own_window(client):
    """The reset has to survive the fix — a different book is a different book, and
    the last one's read days are not this one's."""
    start, later = "2026-07-14", "2026-07-27"
    client.put(f"/book?day={start}", json={"current_book": "First Book", "chapters": 10})
    client.post("/reading/log", json={"chapters": 6, "label": "1-6", "day": start})
    client.post("/completions", json={"quest_id": "d-read", "day": start})
    assert _book_started_week(client) == "2026-W29"

    r = client.put(f"/book?day={later}", json={"current_book": "Second Book", "chapters": 12}).json()
    assert r["reading"]["chapters_read"] == 0 and r["reading"]["days_read"] == 0
    assert _book_started_week(client) == "2026-W31"


def test_answering_the_check_in_this_week_survives_a_length_correction(client):
    """"Not yet" holds for the week you said it in. Correcting the length afterwards
    is not a new book, so it mustn't re-open the check-in you already answered."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Short Book", "chapters": 4})
    client.post("/reading/log", json={"chapters": 4, "label": "1-4", "day": day})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is True

    client.post(f"/book/review?day={day}", json={"finished": False, "next_book": ""})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is False

    # 3 chapters, not 4 — still covered, so only the held answer keeps it quiet.
    body = client.put(f"/book?day={day}", json={"current_book": "Short Book", "chapters": 3}).json()
    assert body["reading"]["progress"] == 1.0 and body["book_review"]["pending"] is False

    # A different book, though, is asked about on its own terms again.
    client.put(f"/book?day={day}", json={"current_book": "Other Book", "chapters": 1})
    client.post("/reading/log", json={"chapters": 1, "label": "1", "day": day})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is True


def test_logging_reading_needs_a_book_first(client):
    r = client.post("/reading/log", json={"chapters": 2, "label": "1–2", "day": "2026-07-18"})
    assert r.status_code == 400


def test_parse_search_normalises_and_builds_cover_url():
    payload = {"docs": [
        {"title": "Atomic Habits", "author_name": ["James Clear"],
         "number_of_pages_median": 320, "cover_i": 8908, "first_publish_year": 2018},
        {"title": "", "author_name": ["Nobody"]},  # no title → dropped
        {"title": "No Cover Book", "first_publish_year": 2001},  # missing author/cover ok
    ]}
    items = books._parse_search(payload)
    assert [b["title"] for b in items] == ["Atomic Habits", "No Cover Book"]
    a = items[0]
    assert a["author"] == "James Clear" and a["pages"] == 320 and a["year"] == 2018
    assert a["cover_url"] == "https://covers.openlibrary.org/b/id/8908-M.jpg"
    # Graceful defaults when fields are missing.
    assert items[1]["author"] == "" and items[1]["pages"] == 0 and items[1]["cover_url"] == ""


def test_parse_search_respects_limit():
    payload = {"docs": [{"title": f"Book {i}"} for i in range(30)]}
    assert len(books._parse_search(payload, limit=5)) == 5


def test_parse_subject_reads_works():
    payload = {"works": [
        {"title": "Deep Work", "authors": [{"name": "Cal Newport"}], "cover_id": 123, "first_publish_year": 2016},
        {"title": "", "authors": []},  # dropped
    ]}
    items = books._parse_subject(payload)
    assert len(items) == 1
    assert items[0]["title"] == "Deep Work" and items[0]["author"] == "Cal Newport"
    assert items[0]["cover_url"] == "https://covers.openlibrary.org/b/id/123-M.jpg"


# ── Curated shelves ───────────────────────────────────────────────────────────


def test_every_curated_book_is_complete_enough_to_pick():
    """The picker estimates chapters from `pages` and shows a cover, so a shelf entry
    missing either arrives as a blank card that sets a book with no finish line."""
    for shelf in books.CURATED:
        assert shelf["label"] and shelf["books"], shelf["label"]
        for b in shelf["books"]:
            assert b["title"] and b["author"], b
            assert b["pages"] > 0, b["title"]
            assert b["cover_url"].startswith("https://covers.openlibrary.org/"), b["title"]
            assert 1900 < b["year"] <= 2030, b["title"]


def test_no_book_is_shelved_twice():
    """A duplicate across shelves reads as a bug while browsing, and quietly says two
    different topics have the same single answer."""
    titles = [b["title"] for shelf in books.CURATED for b in shelf["books"]]
    assert len(titles) == len(set(titles))


def test_suggestions_stand_alone_when_open_library_is_down(monkeypatch):
    """The curated shelves need no network — a browse must never come back empty just
    because Open Library is having a day."""
    def _down(*_a, **_k):
        raise TimeoutError("openlibrary unreachable")

    monkeypatch.setattr(books.net, "get_json", _down)
    shelves = books.suggestions()
    assert [s["label"] for s in shelves] == [s["label"] for s in books.CURATED]
    assert all(s["books"] for s in shelves)


def test_the_curated_shelves_come_before_the_subject_shelves(monkeypatch):
    monkeypatch.setattr(books, "SHELVES", [("Grow", "self_help")])
    monkeypatch.setattr(books.net, "get_json", lambda *a, **k: {"works": [
        {"title": "Something Tagged", "authors": [{"name": "Someone"}]},
    ]})
    labels = [s["label"] for s in books.suggestions()]
    assert labels[0] == books.CURATED[0]["label"]
    assert labels[-1] == "Grow"


def test_a_caller_cannot_mutate_the_curated_shelves(monkeypatch):
    """suggestions() hands out its own lists; the module's data is the source of
    truth for every later browse in the process."""
    monkeypatch.setattr(books, "SHELVES", [])
    before = len(books.CURATED[0]["books"])
    books.suggestions()[0]["books"].clear()
    assert len(books.CURATED[0]["books"]) == before


def test_finishing_a_book_unlocks_the_achievement_on_the_same_tap(client):
    """Answering "yes, finished it" is what earns Cover to Cover, and the events come
    back with that answer rather than turning up later on an unrelated quest."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 3})

    # Not offered until the logged chapters actually cover the book.
    client.post("/reading/log", json={"chapters": 2, "label": "1-2", "day": day})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is False

    client.post("/reading/log", json={"chapters": 1, "label": "3", "day": day})
    assert client.get(f"/state?day={day}").json()["book_review"]["pending"] is True

    r = client.post(f"/book/review?day={day}", json={"finished": True, "next_book": "Deep Work"}).json()
    assert [e["data"]["id"] for e in r["events"] if e["type"] == "achievement"] == ["book-1"]

    # And the state that comes back has already rolled to the next book.
    reading = r["state"]["reading"]
    assert reading["book"] == "Deep Work"
    assert reading["books_finished"] == 1
    assert reading["chapters"] == 0  # length unknown until set, so no bar yet
    assert r["state"]["book_review"]["pending"] is False


def test_book_achievement_is_awarded_once(client):
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "One", "chapters": 1})
    client.post("/reading/log", json={"chapters": 1, "label": "1", "day": day})
    first = client.post(f"/book/review?day={day}", json={"finished": True, "next_book": "Two"}).json()
    assert any(e["data"]["id"] == "book-1" for e in first["events"])

    # A second book earns nothing new — book-5 is still four away.
    client.put(f"/book?day={day}", json={"current_book": "Two", "chapters": 1})
    client.post("/reading/log", json={"chapters": 1, "label": "1", "day": day})
    second = client.post(f"/book/review?day={day}", json={"finished": True, "next_book": ""}).json()
    assert [e["data"]["id"] for e in second["events"] if e["type"] == "achievement"] == []
    assert second["state"]["reading"] is None  # no next book, so nothing to show


def test_not_finished_earns_nothing_and_keeps_the_book(client):
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 2})
    client.post("/reading/log", json={"chapters": 2, "label": "1-2", "day": day})
    r = client.post(f"/book/review?day={day}", json={"finished": False, "next_book": ""}).json()
    assert r["events"] == []
    assert r["state"]["reading"]["book"] == "Atomic Habits"
    assert r["state"]["reading"]["books_finished"] == 0


def _plant_generated_reading_quest(day: str, title: str) -> None:
    """A personalised reading day that names the book, as the LLM would leave it."""
    import json as _json

    from app.db import SessionLocal
    from app.models import GeneratedQuest, Player

    session = SessionLocal()
    pid = session.query(Player).first().id
    session.add(
        GeneratedQuest(
            player_id=pid, quest_id="d-read", period_key=day,
            title="Grimoire Study", desc=f"20 min in {title}",
            steps=_json.dumps([f"Read {title} at your pace, then log which chapters"]),
            resource="📖 " + title,
        )
    )
    session.commit()
    session.close()


def test_finishing_a_book_stops_the_quests_naming_it(client):
    """Rolling to the next book has to drop the personalised reading day with it.

    Otherwise the Quests tab keeps telling you to read the book you just finished —
    the title is baked into the generated row, not substituted at read time."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 2})
    client.post("/reading/log", json={"chapters": 2, "label": "1-2", "day": day})
    _plant_generated_reading_quest(day, "Atomic Habits")

    # It really is being served before the finish.
    q = next(x for x in client.get(f"/state?day={day}").json()["quests"] if x["id"] == "d-read")
    assert "Atomic Habits" in q["steps"][0]

    client.post(f"/book/review?day={day}", json={"finished": True, "next_book": "Deep Work"})

    st = client.get(f"/state?day={day}").json()
    assert st["reading"]["book"] == "Deep Work"
    q = next(x for x in st["quests"] if x["id"] == "d-read")
    assert "Atomic Habits" not in " ".join(q["steps"]) + q["desc"] + q["resource"]


def test_not_finished_keeps_the_personalised_reading_day(client):
    """Saying "not yet" changes nothing about the book, so the quest tuned to it
    stands — re-generating it would be a day's LLM call spent on no news."""
    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 2})
    client.post("/reading/log", json={"chapters": 2, "label": "1-2", "day": day})
    _plant_generated_reading_quest(day, "Atomic Habits")

    client.post(f"/book/review?day={day}", json={"finished": False, "next_book": ""})

    q = next(x for x in client.get(f"/state?day={day}").json()["quests"] if x["id"] == "d-read")
    assert "Atomic Habits" in q["steps"][0]


def test_the_book_so_far_follows_the_book_you_are_actually_reading(client):
    """Finishing a book must not leave its running sentence on the Learn tab.

    thread_for picks the most recently touched thread, which is right for a digest
    built for a past morning and wrong for the app — unscoped, the panel goes on
    describing the book you just closed until the next one earns a thread."""
    import json as _json

    from app.db import SessionLocal
    from app.models import Player, Thread

    day = "2026-07-18"
    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 1})
    client.post("/reading/log", json={"chapters": 1, "label": "1", "day": day})

    session = SessionLocal()
    pid = session.query(Player).first().id
    session.add(Thread(
        player_id=pid, key="atomic habits", title="Atomic Habits",
        summary="Small habits compound.", days=3, day=day,
    ))
    session.commit()
    session.close()

    assert client.get(f"/state?day={day}").json()["thread"]["title"] == "Atomic Habits"

    # Roll to a book that has no thread of its own yet.
    client.post(f"/book/review?day={day}", json={"finished": True, "next_book": "Deep Work"})
    st = client.get(f"/state?day={day}").json()
    assert st["reading"]["book"] == "Deep Work"
    assert st["thread"] is None, "the finished book's sentence is still on the screen"

    # And with no book at all there is nothing to summarise.
    client.post("/reading/log", json={"chapters": 1, "label": "1", "day": day})
    client.post(f"/book/review?day={day}", json={"finished": True, "next_book": ""})
    assert client.get(f"/state?day={day}").json()["thread"] is None
