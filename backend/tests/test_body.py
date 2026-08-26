"""Integration tests for the standalone Body tools (nutrition + skincare)."""

from app import skincare

DAY = "2026-07-18"


def test_body_defaults_and_skincare_seeded(client):
    b = client.get(f"/body/state?day={DAY}").json()
    assert b["profile"] is None  # nothing set yet
    assert b["targets"] is None  # no target without a profile
    assert b["food"]["entries"] == []
    assert b["food"]["plate"] == {"protein": 0, "veg": 0, "carb": 0, "extra": 0}
    assert b["plate_targets"] is None  # no profile → no plan, in grams or in hands
    assert b["week"]["logged_days"] == 0 and len(b["week"]["days"]) == 7
    # "What to eat" suggestions are always there, covering protein, fibre and meals.
    assert {s["tag"] for s in b["suggestions"]} == {"protein", "fibre", "meal"}
    # The skincare routine is seeded from the template: SPF in the morning,
    # a treatment step in the evening.
    assert any("Sunscreen" in s["text"] for s in b["skincare_am"])
    assert any("Treatment" in s["text"] for s in b["skincare_pm"])
    assert b["skincare_note"] and b["skincare_resources"]


def test_profile_produces_targets(client):
    r = client.put(f"/body/profile?day={DAY}", json={
        "sex": "male", "age": 30, "height_cm": 180, "weight_kg": 80,
        "activity": "moderate", "goal": "maintain",
    })
    b = r.json()
    assert b["profile"]["weight_kg"] == 80
    assert b["targets"]["target"] == 2759
    assert b["targets"]["protein_g"] == 144  # 1.8 g/kg
    assert b["targets"]["fibre_g"] == 39
    assert b["targets"]["bmi"] == 24.7 and b["targets"]["bmi_category"] == "healthy"


def test_goal_weight_sets_a_gentle_deficit(client):
    # A goal below current weight yields a gentle deficit target below maintenance.
    r = client.put(f"/body/profile?day={DAY}", json={
        "sex": "male", "age": 28, "height_cm": 163, "weight_kg": 76,
        "activity": "moderate", "goal": "maintain", "goal_weight_kg": 65,
    })
    t = r.json()["targets"]
    assert r.json()["profile"]["goal_weight_kg"] == 65
    assert t["goal_weight"] == 65
    assert t["target"] < t["tdee"]  # deficit, because 76 > 65
    assert t["bmi_category"] == "overweight"  # 76 kg at 163 cm


def test_a_plate_is_logged_in_hands_and_tallied(client):
    # The daily unit is the hand, because a bought plate can't be weighed. Nothing
    # about the day's screen asks for a calorie.
    client.put(f"/body/profile?day={DAY}", json={"sex": "male", "age": 30, "height_cm": 175,
                                                 "weight_kg": 78, "activity": "moderate",
                                                 "goal": "maintain"})
    b = client.post(f"/food/log?day={DAY}", json={
        "name": "Chicken adobo & rice", "slot": "lunch", "place": "Aling Nena's",
        "at_time": "12:15", "protein_p": 1, "carb_p": 2,
    }).json()
    entry = b["food"]["entries"][0]
    assert entry["slot"] == "lunch" and entry["place"] == "Aling Nena's"
    assert entry["at_time"] == "12:15"
    assert b["food"]["plate"] == {"protein": 1, "veg": 0, "carb": 2, "extra": 0}
    # A plate logged in hands carries no calories at all — they're only ever derived.
    assert entry["kcal"] == 0 and b["food"]["total_kcal"] == 0

    # A second plate adds to the tally.
    b = client.post(f"/food/log?day={DAY}", json={
        "name": "Tinola", "slot": "dinner", "protein_p": 1, "veg_p": 2,
    }).json()
    assert b["food"]["plate"] == {"protein": 2, "veg": 2, "carb": 2, "extra": 0}
    # And the day's plan is in the same unit, so the screen and the quest agree.
    assert b["plate_targets"] == {"protein": 5, "veg": 3, "carb": 5, "extra": 2}


def test_the_week_carries_the_calorie_range_the_day_refuses_to(client):
    # 15a's band, moved to where the estimate error averages out.
    client.put(f"/body/profile?day={DAY}", json={"sex": "male", "age": 30, "height_cm": 175,
                                                 "weight_kg": 78, "activity": "moderate",
                                                 "goal": "maintain"})
    for day, palms in (("2026-07-16", 2), ("2026-07-17", 3), (DAY, 3)):
        client.post(f"/food/log?day={day}", json={
            "name": "The day", "protein_p": palms, "veg_p": 2, "carb_p": 3,
        })
    week = client.get(f"/body/state?day={DAY}").json()["week"]
    assert week["logged_days"] == 3
    assert week["band_low"] and week["band_high"]
    assert 0 < week["kcal_low"] < week["kcal_high"]
    # Per day, not per week: three lightly-logged days can't add up to a week's food.
    assert week["kcal_high"] < week["band_high"] * 2
    # The per-day figures are rounded at their own step, so nothing on the trend
    # screen reads more precise than the week it was divided from.
    assert week["kcal_low"] % 50 == 0 and week["kcal_high"] % 50 == 0
    assert week["fibre_low"] % 5 == 0 and week["protein_high"] % 5 == 0
    today = next(d for d in week["days"] if d["day"] == DAY)
    assert today["logged"] == 1 and today["protein"] == 3
    assert week["days"][-1]["day"] == DAY and len(week["days"]) == 7


def test_usuals_are_the_plates_youve_logged_before(client):
    # Eating out means the same eight places, so a repeat should be one tap.
    for day in ("2026-07-16", "2026-07-17", DAY):
        client.post(f"/food/log?day={day}", json={"name": "Silog", "protein_p": 1, "carb_p": 2})
    client.post(f"/food/log?day={DAY}", json={"name": "Tinola", "protein_p": 1, "veg_p": 2})
    # A packaged food logged by its label has nothing to repeat — it isn't a plate.
    client.post(f"/food/log?day={DAY}", json={"name": "Protein bar", "grams": 60, "kcal": 220})
    usuals = client.get(f"/body/state?day={DAY}").json()["usuals"]
    assert [u["name"] for u in usuals] == ["Silog", "Tinola"]
    assert usuals[0]["count"] == 3 and usuals[0]["carb"] == 2


def test_food_log_totals_and_delete(client):
    client.put(f"/body/profile?day={DAY}", json={"sex": "female", "age": 28, "height_cm": 165,
                                                 "weight_kg": 60, "activity": "light", "goal": "maintain"})
    r = client.post(f"/food/log?day={DAY}", json={"name": "Oats", "grams": 60, "kcal": 233,
                                                  "protein_g": 10, "fibre_g": 6})
    b = r.json()
    assert b["food"]["total_kcal"] == 233 and b["food"]["total_protein"] == 10
    assert b["food"]["total_fibre"] == 6
    assert len(b["food"]["entries"]) == 1
    entry_id = b["food"]["entries"][0]["id"]
    # A second entry adds up.
    b = client.post(f"/food/log?day={DAY}", json={"name": "Egg", "kcal": 78, "protein_g": 6}).json()
    assert b["food"]["total_kcal"] == 311
    # Deleting the first leaves only the second.
    b = client.request("DELETE", f"/food/log/{entry_id}?day={DAY}").json()
    assert b["food"]["total_kcal"] == 78
    # Food never touches the game state — it's standalone.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0


def test_country_persists_and_localises_suggestions(client):
    r = client.put(f"/body/profile?day={DAY}", json={
        "sex": "male", "age": 30, "height_cm": 170, "weight_kg": 70,
        "activity": "moderate", "goal": "maintain", "country": "ph",
    })
    b = r.json()
    assert b["profile"]["country"] == "PH"  # stored upper-cased
    # The "what to eat" board now shows local picks.
    assert any("monggo" in s["name"].lower() or "tinola" in s["name"].lower()
               for s in b["suggestions"])


def test_skincare_products_localise_and_carry_brands():
    world = skincare.product_suggestions()
    ph = skincare.product_suggestions("ph")  # case-insensitive
    assert all(p["brand"] and p["product"] and p["slot"] in {"AM", "PM"} for p in world)
    assert ph != world  # PH swaps in locally-stocked picks
    assert any("Beauty of Joseon" in p["brand"] for p in ph)  # a PH-popular sunscreen
    assert skincare.product_suggestions("zz") == world  # unknown country → worldwide


def test_skincare_search_reads_ingredients(client, monkeypatch):
    # Stub the network so the route is tested without hitting Open Beauty Facts.
    def fake_lookup(q, timeout=8.0, limit=8):
        return skincare._parse_products({"products": [
            {"product_name": "Test Serum", "brands": "ACME",
             "ingredients_text": "Aqua, Niacinamide, Zinc Oxide, Parfum"},
        ]})
    monkeypatch.setattr(skincare, "lookup", fake_lookup)
    r = client.get("/skincare/search?q=niacinamide")
    assert r.status_code == 200
    items = r.json()
    assert items[0]["name"] == "Test Serum"
    assert {h["label"] for h in items[0]["helpful"]} == {"Niacinamide", "Sunscreen filter"}
    assert items[0]["watch"][0]["label"] == "Fragrance"


def test_skincare_search_failure_is_a_clean_502(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network down")
    monkeypatch.setattr(skincare, "lookup", boom)
    assert client.get("/skincare/search?q=cerave").status_code == 502


def test_skincare_completion_feeds_spirit_and_streak(client):
    b = client.get(f"/body/state?day={DAY}").json()
    assert b["skincare_streak"] == 0 and b["skincare_days"] == 0
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0

    # Tick every morning step → the AM block is complete for the day.
    for step in b["skincare_am"]:
        client.post(f"/skincare/check?day={DAY}", json={"step_id": step["id"], "done": True})

    b = client.get(f"/body/state?day={DAY}").json()
    assert b["skincare_streak"] == 1 and b["skincare_days"] == 1
    # It now feeds Spirit (and overall XP) — self-care counts.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 5  # SKINCARE_BLOCK_XP

    # Un-ticking one step breaks the block → back to zero.
    client.post(f"/skincare/check?day={DAY}", json={"step_id": b["skincare_am"][0]["id"], "done": False})
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0


def test_skincare_check_and_edit(client):
    b = client.get(f"/body/state?day={DAY}").json()
    step = b["skincare_am"][0]
    assert step["done"] is False
    # Tick it for today.
    b = client.post(f"/skincare/check?day={DAY}", json={"step_id": step["id"], "done": True}).json()
    assert next(s for s in b["skincare_am"] if s["id"] == step["id"])["done"] is True
    # A tick is per-day: a different day is untouched.
    other = client.get("/body/state?day=2026-07-19").json()
    assert next(s for s in other["skincare_am"] if s["id"] == step["id"])["done"] is False
    # Add a custom PM step, then remove it.
    b = client.post(f"/skincare/step?day={DAY}", json={"routine": "PM", "text": "Lip balm"}).json()
    added = next(s for s in b["skincare_pm"] if s["text"] == "Lip balm")
    b = client.request("DELETE", f"/skincare/step/{added['id']}?day={DAY}").json()
    assert all(s["text"] != "Lip balm" for s in b["skincare_pm"])
