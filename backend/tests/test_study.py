"""The Learn tab's study cards: one per subject the board deals today."""

from datetime import date, timedelta

from app import japanese, sketch, study

JP_DAY = "2026-07-18"  # Saturday — a Japanese day
SKETCH_DAY = "2026-07-19"  # Sunday — the drawing day after it
CRAFT_DAY = "2026-07-20"  # Monday — the week's first Craft day, and Japanese's turn


def _studies(client, day):
    r = client.get(f"/state?day={day}")
    assert r.status_code == 200, r.text
    return r.json()["studies"]


def _pick(cards, subject):
    return next(c for c in cards if c["subject"] == subject)


def _study(client, day, subject=None):
    """The day's card for `subject` — or, left out, the day's only card."""
    cards = _studies(client, day)
    if subject is None:
        assert len(cards) == 1, [c["subject"] for c in cards]
        return cards[0]
    return _pick(cards, subject)


def _tick(client, day, subject, done=True):
    r = client.post(f"/study/piece?day={day}", json={"subject": subject, "done": done})
    assert r.status_code == 200, r.text
    return r.json()


def test_the_cards_follow_the_board(client):
    """The whole point: Learn used to show system design every morning, including the
    days the board isn't on it. Now the cards are whatever the day deals."""
    assert [c["subject"] for c in _studies(client, JP_DAY)] == ["japanese"]
    assert [c["subject"] for c in _studies(client, SKETCH_DAY)] == ["sketch"]
    assert [c["subject"] for c in _studies(client, CRAFT_DAY)] == ["craft", "japanese"]


def test_japanese_and_drawing_take_turns_every_day(client):
    """One or the other every day, never both, never the same twice running — straight
    across the Sunday→Monday seam a weekday table can't get past."""
    start = date.fromisoformat("2026-09-21")  # a Monday
    walks = []
    for offset in range(15):
        day = (start + timedelta(days=offset)).isoformat()
        subjects = {c["subject"] for c in _studies(client, day)} - {"craft"}
        assert len(subjects) == 1, (day, subjects)
        walks.append(subjects.pop())
    assert all(a != b for a, b in zip(walks, walks[1:])), walks
    # Anchored so the old table's last Japanese day stays one, and today follows it.
    assert walks[1] == "japanese" and walks[2] == "sketch"  # Tue 22nd, Wed 23rd


def test_every_subject_answers_the_same_shape(client):
    """Three plans built differently underneath, one card drawing them."""
    keys = set(_study(client, CRAFT_DAY, "craft"))
    assert keys == set(_study(client, JP_DAY)) == set(_study(client, SKETCH_DAY))
    for day, subject, stat, title in (
        (CRAFT_DAY, "craft", "CFT", "System design"),
        (JP_DAY, "japanese", "INT", "Japanese"),
        (SKETCH_DAY, "sketch", "CRE", "Drawing"),
    ):
        card = _study(client, day, subject)
        assert card["stat"] == stat and card["title"] == title
        assert card["phase"] >= 1 and card["phases"] >= 1
        assert card["done"] <= card["pieces"]


def test_a_walk_moves_on_and_takes_it_back(client):
    """The two walks are a position: one button moves it, the same button undoes it."""
    first = _study(client, SKETCH_DAY)
    assert first["label"] == "Seeing" and first["done"] == 0
    assert first["piece"] == first["plan"][0] and first["steps"]

    moved = _tick(client, SKETCH_DAY, "sketch")["studies"][0]
    assert moved["done"] == 1 and moved["piece"] == first["plan"][1]

    back = _tick(client, SKETCH_DAY, "sketch", done=False)["studies"][0]
    assert back["done"] == 0 and back["piece"] == first["plan"][0]

    # Undo at the start has nothing to take back, and never goes negative.
    floor = _tick(client, SKETCH_DAY, "sketch", done=False)["studies"][0]
    assert floor["done"] == 0 and floor["piece"] == first["plan"][0]


def test_a_walk_crosses_into_the_next_stage(client):
    """The bar measures the stage, so covering one hands you the next rather than
    filling up and stopping."""
    stage_one = _study(client, SKETCH_DAY)["pieces"]
    for _ in range(stage_one):
        _tick(client, SKETCH_DAY, "sketch")
    card = _study(client, SKETCH_DAY)
    assert (
        card["phase"] == 2 and card["label"] == "Negative space" and card["done"] == 0
    )


def test_the_walks_hold_at_the_end_rather_than_running_out(client):
    for _ in range(len(sketch.PLAN) + 5):
        _tick(client, SKETCH_DAY, "sketch")
    card = _study(client, SKETCH_DAY)
    assert card["is_last"] is True and card["piece"] == sketch.PLAN[-1]["title"]


def test_the_tick_lands_on_the_card_it_came_from(client):
    """Monday carries two cards. Ticking system design moves Craft — and hands over the
    next chapter as the source — while the day's Japanese stays put, and vice versa."""
    plan = _study(client, CRAFT_DAY, "craft")["plan"]
    jp_before = _study(client, CRAFT_DAY, "japanese")
    moved = _tick(client, CRAFT_DAY, "craft")
    assert _pick(moved["studies"], "craft")["done"] == 1
    assert moved["craft"]["source"] == plan[1]
    assert _pick(moved["studies"], "japanese")["piece"] == jp_before["piece"]

    moved = _tick(client, CRAFT_DAY, "japanese")
    assert _pick(moved["studies"], "japanese")["done"] == jp_before["done"] + 1
    assert _pick(moved["studies"], "craft")["done"] == 1


def test_a_subject_the_day_doesnt_deal_cant_move(client):
    """Sunday is drawing; a stale card asking to move Japanese gets told no."""
    before = _study(client, JP_DAY)
    r = client.post(f"/study/piece?day={SKETCH_DAY}", json={"subject": "japanese", "done": True})
    assert r.status_code == 400
    assert _study(client, JP_DAY)["piece"] == before["piece"]


def test_ticking_one_subject_leaves_the_others_where_they_were(client):
    """Each plan is its own position — Sunday's drawing never moves Saturday's kana."""
    before = _study(client, JP_DAY)
    _tick(client, SKETCH_DAY, "sketch")
    assert _study(client, JP_DAY)["piece"] == before["piece"]


def test_japanese_advances_with_its_quest_too(client):
    """The card and the daily are two views of one position, so clearing the quest
    moves what the card shows — and lands on the plan's very next step."""
    before = _study(client, JP_DAY)
    done = client.post("/completions", json={"quest_id": "d-jp", "day": JP_DAY})
    assert done.status_code == 200, done.text
    after = _study(client, JP_DAY)
    assert after["done"] == before["done"] + 1
    assert after["piece"] == japanese.PLAN[1]["title"]


def test_the_drawing_plan_is_whole():
    """Every step names its stage, says how long it takes and points somewhere."""
    assert {s["stage"] for s in sketch.PLAN} == set(sketch.STAGES)
    for step in sketch.PLAN:
        assert step["title"] and step["desc"] and step["steps"] and step["resource"]
    # Stages stay contiguous — the card reads a position as "stage 2 of 5", which is a
    # lie the moment a stage's steps are split across the plan.
    order = [s["stage"] for s in sketch.PLAN]
    assert order == sorted(order, key=lambda s: list(sketch.STAGES).index(s))


def test_a_day_with_no_study_daily_has_no_card():
    """Nothing in the schedule does this today, but the cards are built from the day's
    dailies rather than assuming one is always there."""
    assert study.subjects_for({"d-meditate", "d-train"}) == []
