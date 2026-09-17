"""The Learn tab's study card: one card, on whichever subject the board is on today."""

from app import japanese, sketch, study

JP_DAY = "2026-07-18"  # Saturday — one of Japanese's two days
SKETCH_DAY = "2026-07-19"  # Sunday — one of Creativity's two
CRAFT_DAY = "2026-07-20"  # Monday — the week's first Craft day


def _study(client, day):
    r = client.get(f"/state?day={day}")
    assert r.status_code == 200, r.text
    return r.json()["study"]


def test_the_card_follows_the_board(client):
    """The whole point: Learn used to show system design every morning, including the
    four a week the board isn't on it. Now the two alternate together."""
    assert _study(client, JP_DAY)["subject"] == "japanese"
    assert _study(client, SKETCH_DAY)["subject"] == "sketch"
    assert _study(client, CRAFT_DAY)["subject"] == "craft"


def test_every_subject_answers_the_same_shape(client):
    """Three plans built differently underneath, one card drawing them."""
    keys = set(_study(client, CRAFT_DAY))
    assert keys == set(_study(client, JP_DAY)) == set(_study(client, SKETCH_DAY))
    for day, stat, title in (
        (CRAFT_DAY, "CFT", "System design"),
        (JP_DAY, "INT", "Japanese"),
        (SKETCH_DAY, "CRE", "Drawing"),
    ):
        card = _study(client, day)
        assert card["stat"] == stat and card["title"] == title
        assert card["phase"] >= 1 and card["phases"] >= 1
        assert card["done"] <= card["pieces"]


def test_a_walk_moves_on_and_takes_it_back(client):
    """The two walks are a position: one button moves it, the same button undoes it."""
    first = _study(client, SKETCH_DAY)
    assert first["label"] == "Seeing" and first["done"] == 0
    assert first["piece"] == first["plan"][0] and first["steps"]

    moved = client.post(f"/study/piece?day={SKETCH_DAY}", json={"done": True}).json()[
        "study"
    ]
    assert moved["done"] == 1 and moved["piece"] == first["plan"][1]

    back = client.post(f"/study/piece?day={SKETCH_DAY}", json={"done": False}).json()[
        "study"
    ]
    assert back["done"] == 0 and back["piece"] == first["plan"][0]

    # Undo at the start has nothing to take back, and never goes negative.
    floor = client.post(f"/study/piece?day={SKETCH_DAY}", json={"done": False}).json()[
        "study"
    ]
    assert floor["done"] == 0 and floor["piece"] == first["plan"][0]


def test_a_walk_crosses_into_the_next_stage(client):
    """The bar measures the stage, so covering one hands you the next rather than
    filling up and stopping."""
    stage_one = _study(client, SKETCH_DAY)["pieces"]
    for _ in range(stage_one):
        client.post(f"/study/piece?day={SKETCH_DAY}", json={"done": True})
    card = _study(client, SKETCH_DAY)
    assert (
        card["phase"] == 2 and card["label"] == "Negative space" and card["done"] == 0
    )


def test_the_walks_hold_at_the_end_rather_than_running_out(client):
    for _ in range(len(sketch.PLAN) + 5):
        client.post(f"/study/piece?day={SKETCH_DAY}", json={"done": True})
    card = _study(client, SKETCH_DAY)
    assert card["is_last"] is True and card["piece"] == sketch.PLAN[-1]["title"]


def test_the_tick_lands_on_craft_on_a_craft_day(client):
    """One button, three plans — on Monday it's the system-design piece it ticks, which
    also hands over the next chapter as the source."""
    plan = _study(client, CRAFT_DAY)["plan"]
    moved = client.post(f"/study/piece?day={CRAFT_DAY}", json={"done": True}).json()
    assert moved["study"]["done"] == 1
    assert moved["craft"]["source"] == plan[1]


def test_ticking_one_subject_leaves_the_others_where_they_were(client):
    """Each plan is its own position — Sunday's drawing never moves Saturday's kana."""
    before = _study(client, JP_DAY)
    client.post(f"/study/piece?day={SKETCH_DAY}", json={"done": True})
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
    """Nothing in the schedule does this today, but the card is built from the day's
    dailies rather than assuming one is always there."""
    assert study.subject_for({"d-meditate", "d-train"}) is None
