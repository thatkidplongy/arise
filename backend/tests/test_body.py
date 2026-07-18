"""Integration tests for the standalone Body tools (nutrition + skincare)."""

DAY = "2026-07-18"


def test_body_defaults_and_skincare_seeded(client):
    b = client.get(f"/body?day={DAY}").json()
    assert b["profile"] is None  # nothing set yet
    assert b["targets"] is None  # no target without a profile
    assert b["food"] == {"entries": [], "total_kcal": 0, "total_protein": 0, "total_fibre": 0}
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


def test_skincare_check_and_edit(client):
    b = client.get(f"/body?day={DAY}").json()
    step = b["skincare_am"][0]
    assert step["done"] is False
    # Tick it for today.
    b = client.post(f"/skincare/check?day={DAY}", json={"step_id": step["id"], "done": True}).json()
    assert next(s for s in b["skincare_am"] if s["id"] == step["id"])["done"] is True
    # A tick is per-day: a different day is untouched.
    other = client.get("/body?day=2026-07-19").json()
    assert next(s for s in other["skincare_am"] if s["id"] == step["id"])["done"] is False
    # Add a custom PM step, then remove it.
    b = client.post(f"/skincare/step?day={DAY}", json={"routine": "PM", "text": "Lip balm"}).json()
    added = next(s for s in b["skincare_pm"] if s["text"] == "Lip balm")
    b = client.request("DELETE", f"/skincare/step/{added['id']}?day={DAY}").json()
    assert all(s["text"] != "Lip balm" for s in b["skincare_pm"])
