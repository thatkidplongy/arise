"""Unit tests for the Open Library parsers (pure, no network)."""

from app import books, state


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


def test_furthest_chapter_reads_a_label_the_way_a_reader_would():
    assert state.furthest_chapter("21-22") == 22
    assert state.furthest_chapter("ch 5 – 7") == 7
    assert state.furthest_chapter("3, 5, 8") == 8
    assert state.furthest_chapter("12") == 12
    assert state.furthest_chapter("the intro") == 0
    assert state.furthest_chapter("") == 0
    # A stray number can't put you past the last chapter of a book we know.
    assert state.furthest_chapter("published 2011", total=35) == 35
    assert state.furthest_chapter("published 2011") == 2011  # nothing to clamp to


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

    # But saying so still works, and rolls to the next book.
    body = client.post(f"/book/review?day={day}", json={"finished": True, "next_book": "Next"}).json()
    assert body["player"]["books_finished"] == 1 and body["player"]["current_book"] == "Next"


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
