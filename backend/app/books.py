"""Book search + suggestions via Open Library — free, no API key, the largest
freely-searchable catalogue (Internet Archive). Same stdlib/urllib approach as the
food lookup; HTTP lives here, the `_parse_*` helpers are pure and testable.

Two things:
  • `search(query)` — find a book to set as your current read (title, author,
    page count, cover, year).
  • `suggestions()` — a few themed shelves (Grow / Money / Craft / Calm), pulled
    from Open Library subjects, matched to what this app is about.
"""

import json
import urllib.parse
import urllib.request

_SEARCH_URL = "https://openlibrary.org/search.json"
_SUBJECT_URL = "https://openlibrary.org/subjects/{subject}.json"
_COVER_URL = "https://covers.openlibrary.org/b/id/{cid}-M.jpg"
_HEADERS = {"User-Agent": "Arise-Wellness/1.0 (personal reading tracker)"}

# (shelf label, Open Library subject slug) — themed to the app's spirit.
SHELVES: list[tuple[str, str]] = [
    ("Grow", "self_help"),
    ("Money", "personal_finance"),
    ("Craft", "computer_science"),
    ("Calm", "mindfulness"),
]


def _cover(cid) -> str:
    return _COVER_URL.format(cid=cid) if isinstance(cid, int) else ""


def _int(v) -> int:
    return v if isinstance(v, int) and v > 0 else 0


def _book(title: str, author: str, pages, cover_id, year) -> dict | None:
    title = (title or "").strip()
    if not title:
        return None
    return {
        "title": title,
        "author": (author or "").strip(),
        "pages": _int(pages),
        "cover_url": _cover(cover_id),
        "year": _int(year),
    }


def _parse_search(payload: dict, limit: int = 15) -> list[dict]:
    """Pure: Open Library search.json → normalised book dicts."""
    out: list[dict] = []
    for d in payload.get("docs", []):
        authors = d.get("author_name") or []
        b = _book(
            d.get("title", ""),
            authors[0] if authors else "",
            d.get("number_of_pages_median"),
            d.get("cover_i"),
            d.get("first_publish_year"),
        )
        if b:
            out.append(b)
        if len(out) >= limit:
            break
    return out


def _parse_subject(payload: dict, limit: int = 6) -> list[dict]:
    """Pure: Open Library /subjects/{slug}.json → normalised book dicts."""
    out: list[dict] = []
    for w in payload.get("works", []):
        authors = w.get("authors") or []
        b = _book(
            w.get("title", ""),
            authors[0].get("name", "") if authors else "",
            None,  # subject listings don't carry page counts
            w.get("cover_id"),
            w.get("first_publish_year"),
        )
        if b:
            out.append(b)
        if len(out) >= limit:
            break
    return out


def search(query: str, timeout: float = 8.0, limit: int = 15) -> list[dict]:
    """Search Open Library for a book. Raises on transport/parse error."""
    q = (query or "").strip()
    if not q:
        return []
    params = urllib.parse.urlencode({
        "q": q,
        "fields": "title,author_name,cover_i,number_of_pages_median,first_publish_year",
        "limit": limit,
    })
    req = urllib.request.Request(f"{_SEARCH_URL}?{params}", headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return _parse_search(json.load(resp), limit)


def _subject(slug: str, timeout: float, per_shelf: int) -> list[dict]:
    params = urllib.parse.urlencode({"limit": per_shelf})
    req = urllib.request.Request(f"{_SUBJECT_URL.format(subject=slug)}?{params}", headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return _parse_subject(json.load(resp), per_shelf)


def suggestions(timeout: float = 8.0, per_shelf: int = 6) -> list[dict]:
    """Themed shelves for the 'what to read' browse. A shelf that fails to load is
    simply skipped, so a single flaky subject never breaks the whole response."""
    shelves: list[dict] = []
    for label, slug in SHELVES:
        try:
            books = _subject(slug, timeout, per_shelf)
        except Exception:
            books = []
        if books:
            shelves.append({"label": label, "books": books})
    return shelves
