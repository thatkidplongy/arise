"""Unit tests for the Open Library parsers (pure, no network)."""

from app import books


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
