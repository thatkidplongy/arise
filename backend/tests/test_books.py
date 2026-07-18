"""Unit tests for the Open Library parsers (pure, no network)."""

from app import books


def test_reading_progress_tracks_completed_dailies(client):
    day = "2026-07-18"
    assert client.get(f"/state?day={day}").json()["reading"] is None  # no book yet

    # Set a book whose length makes the pace exactly 14 days at reading level 0.
    client.put(f"/book?day={day}", json={"current_book": "Atomic Habits", "chapters": 14})
    r = client.get(f"/state?day={day}").json()["reading"]
    assert r["book"] == "Atomic Habits" and r["days_to_finish"] == 14
    assert r["days_read"] == 0 and r["progress"] == 0.0 and r["done_today"] is False

    # Doing the reading daily today moves the needle — progress is completion-based.
    r = client.post("/completions", json={"quest_id": "d-read", "day": day}).json()["state"]["reading"]
    assert r["days_read"] == 1 and r["done_today"] is True
    assert 0 < r["progress"] < 1


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
