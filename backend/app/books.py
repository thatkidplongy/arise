"""Book search + suggestions via Open Library — free, no API key, the largest
freely-searchable catalogue (Internet Archive). Same stdlib/urllib approach as the
food lookup; HTTP lives here, the `_parse_*` helpers are pure and testable.

Two things:
  • `search(query)` — find a book to set as your current read (title, author,
    page count, cover, year).
  • `suggestions()` — shelves for browsing: the curated topic shelves in `CURATED`
    (static, always there), then broader Grow / Money / Craft / Calm shelves pulled
    from Open Library subjects.
"""

from . import net

_SEARCH_URL = "https://openlibrary.org/search.json"
_SUBJECT_URL = "https://openlibrary.org/subjects/{subject}.json"
_COVER_URL = "https://covers.openlibrary.org/b/id/{cid}-M.jpg"
_HEADERS = {"User-Agent": "Arise-Wellness/1.0 (personal reading tracker)"}

# The topics you're working on, each with the books most consistently named for it.
# Held here rather than fetched: Open Library's subject listings return whatever
# happens to be tagged, so a browse built from them is mostly arbitrary works and
# unofficial summaries. Covers, page counts and years were resolved from Open Library
# once and pinned — none of them change, and the picker's chapter estimate reads
# `pages`. Add a title by hand and it stays; nothing here is generated at runtime.
CURATED: list[dict] = [
    {"label": "Delayed gratification", "books": [
        {"title": "The Marshmallow Test", "author": "Walter Mischel",
         "pages": 326, "year": 2014,
         "cover_url": "https://covers.openlibrary.org/b/id/9819330-M.jpg"},
        {"title": "Willpower", "author": "Roy F. Baumeister",
         "pages": 291, "year": 2011,
         "cover_url": "https://covers.openlibrary.org/b/id/9082644-M.jpg"},
        {"title": "Grit", "author": "Angela Duckworth",
         "pages": 353, "year": 2016,
         "cover_url": "https://covers.openlibrary.org/b/id/7438753-M.jpg"},
    ]},
    {"label": "Human behaviour", "books": [
        {"title": "Behave", "author": "Robert M. Sapolsky",
         "pages": 795, "year": 2017,
         "cover_url": "https://covers.openlibrary.org/b/id/8814831-M.jpg"},
        {"title": "Influence", "author": "Robert B. Cialdini",
         "pages": 287, "year": 1983,
         "cover_url": "https://covers.openlibrary.org/b/id/431011-M.jpg"},
        {"title": "Predictably Irrational", "author": "Dan Ariely",
         "pages": 368, "year": 2008,
         "cover_url": "https://covers.openlibrary.org/b/id/2314080-M.jpg"},
    ]},
    {"label": "Habit building", "books": [
        {"title": "Atomic Habits", "author": "James Clear",
         "pages": 322, "year": 2016,
         "cover_url": "https://covers.openlibrary.org/b/id/12539702-M.jpg"},
        {"title": "The Power of Habit", "author": "Charles Duhigg",
         "pages": 400, "year": 2012,
         "cover_url": "https://covers.openlibrary.org/b/id/9078085-M.jpg"},
        {"title": "Tiny Habits", "author": "B. J. Fogg",
         "pages": 320, "year": 2019,
         "cover_url": "https://covers.openlibrary.org/b/id/9261174-M.jpg"},
    ]},
    {"label": "Focus", "books": [
        {"title": "Deep Work", "author": "Cal Newport",
         "pages": 303, "year": 2016,
         "cover_url": "https://covers.openlibrary.org/b/id/7988607-M.jpg"},
        {"title": "Stolen Focus", "author": "Johann Hari",
         "pages": 352, "year": 2022,
         "cover_url": "https://covers.openlibrary.org/b/id/12664855-M.jpg"},
        {"title": "Indistractable", "author": "Nir Eyal",
         "pages": 336, "year": 2019,
         "cover_url": "https://covers.openlibrary.org/b/id/9129784-M.jpg"},
    ]},
    {"label": "Getting jacked", "books": [
        {"title": "Bigger Leaner Stronger", "author": "Michael Matthews",
         "pages": 360, "year": 2012,
         "cover_url": "https://covers.openlibrary.org/b/id/10656236-M.jpg"},
        {"title": "Starting Strength", "author": "Mark Rippetoe",
         "pages": 347, "year": 2011,
         "cover_url": "https://covers.openlibrary.org/b/id/8722490-M.jpg"},
        {"title": "Science and Development of Muscle Hypertrophy", "author": "Brad Schoenfeld",
         "pages": 312, "year": 2016,
         "cover_url": "https://covers.openlibrary.org/b/id/9395018-M.jpg"},
    ]},
    {"label": "Dopamine regulation", "books": [
        {"title": "Dopamine Nation", "author": "Anna Lembke",
         "pages": 296, "year": 2021,
         "cover_url": "https://covers.openlibrary.org/b/id/11757830-M.jpg"},
        {"title": "The Molecule of More", "author": "Daniel Z. Lieberman",
         "pages": 257, "year": 2018,
         "cover_url": "https://covers.openlibrary.org/b/id/13249963-M.jpg"},
        {"title": "Irresistible", "author": "Adam Alter",
         "pages": 354, "year": 2017,
         "cover_url": "https://covers.openlibrary.org/b/id/15240641-M.jpg"},
    ]},
    {"label": "Behavioural momentum", "books": [
        {"title": "The Compound Effect", "author": "Darren Hardy",
         "pages": 172, "year": 2010,
         "cover_url": "https://covers.openlibrary.org/b/id/7115046-M.jpg"},
        {"title": "The Slight Edge", "author": "Jeff Olson",
         "pages": 168, "year": 2005,
         "cover_url": "https://covers.openlibrary.org/b/id/7285715-M.jpg"},
        {"title": "Mini Habits", "author": "Stephen Guise",
         "pages": 126, "year": 2013,
         "cover_url": "https://covers.openlibrary.org/b/id/8093714-M.jpg"},
    ]},
    {"label": "Systems", "books": [
        {"title": "Thinking in Systems", "author": "Donella H. Meadows",
         "pages": 240, "year": 2008,
         "cover_url": "https://covers.openlibrary.org/b/id/14420637-M.jpg"},
        {"title": "The Fifth Discipline", "author": "Peter M. Senge",
         "pages": 424, "year": 1990,
         "cover_url": "https://covers.openlibrary.org/b/id/5306808-M.jpg"},
        {"title": "An Introduction to General Systems Thinking", "author": "Gerald M. Weinberg",
         "pages": 279, "year": 1975,
         "cover_url": "https://covers.openlibrary.org/b/id/307360-M.jpg"},
    ]},
    {"label": "Environment design", "books": [
        {"title": "Nudge", "author": "Richard H. Thaler",
         "pages": 312, "year": 2008,
         "cover_url": "https://covers.openlibrary.org/b/id/6402116-M.jpg"},
        {"title": "How to Change", "author": "Katy Milkman",
         "pages": 272, "year": 2021,
         "cover_url": "https://covers.openlibrary.org/b/id/10654921-M.jpg"},
        {"title": "The Design of Everyday Things", "author": "Don Norman",
         "pages": 271, "year": 1988,
         "cover_url": "https://covers.openlibrary.org/b/id/10007224-M.jpg"},
    ]},
    {"label": "Psychology-based productivity", "books": [
        {"title": "Four Thousand Weeks", "author": "Oliver Burkeman",
         "pages": 280, "year": 2021,
         "cover_url": "https://covers.openlibrary.org/b/id/11990973-M.jpg"},
        {"title": "Getting Things Done", "author": "David Allen",
         "pages": 279, "year": 2001,
         "cover_url": "https://covers.openlibrary.org/b/id/109288-M.jpg"},
        {"title": "Make Time", "author": "Jake Knapp",
         "pages": 306, "year": 2018,
         "cover_url": "https://covers.openlibrary.org/b/id/14179816-M.jpg"},
    ]},
    {"label": "Discipline", "books": [
        {"title": "Discipline Is Destiny", "author": "Ryan Holiday",
         "pages": 304, "year": 2022,
         "cover_url": "https://covers.openlibrary.org/b/id/13153179-M.jpg"},
        {"title": "Can't Hurt Me", "author": "David Goggins",
         "pages": 364, "year": 2018,
         "cover_url": "https://covers.openlibrary.org/b/id/8305903-M.jpg"},
        {"title": "Discipline Equals Freedom", "author": "Jocko Willink",
         "pages": 228, "year": 2017,
         "cover_url": "https://covers.openlibrary.org/b/id/10464684-M.jpg"},
    ]},
]


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
    payload = net.get_json(_SEARCH_URL, params={
        "q": q,
        "fields": "title,author_name,cover_i,number_of_pages_median,first_publish_year",
        "limit": limit,
    }, headers=_HEADERS, timeout=timeout)
    return _parse_search(payload, limit)


def _subject(slug: str, timeout: float, per_shelf: int) -> list[dict]:
    payload = net.get_json(
        _SUBJECT_URL.format(subject=slug), params={"limit": per_shelf},
        headers=_HEADERS, timeout=timeout,
    )
    return _parse_subject(payload, per_shelf)


def suggestions(timeout: float = 8.0, per_shelf: int = 6) -> list[dict]:
    """Shelves for the 'what to read' browse: the curated topic shelves first, then
    the broader Open Library subjects. A subject shelf that fails to load is simply
    skipped, so a flaky one never breaks the response — and because the curated
    shelves need no network, the browse is never empty."""
    shelves: list[dict] = [
        {"label": s["label"], "books": list(s["books"])} for s in CURATED
    ]
    for label, slug in SHELVES:
        try:
            books = _subject(slug, timeout, per_shelf)
        except Exception:
            books = []
        if books:
            shelves.append({"label": label, "books": books})
    return shelves
