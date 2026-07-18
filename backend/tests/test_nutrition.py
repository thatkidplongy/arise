"""Unit tests for the pure nutrition math and the Open Food Facts parser."""

from app import nutrition


def test_targets_are_sensible_and_gentle():
    base = dict(sex="male", age=30, height_cm=180, weight_kg=80)
    maintain = nutrition.targets(**base, activity="moderate", goal="maintain")
    assert maintain["bmr"] == 1780
    assert maintain["tdee"] == 2759
    assert maintain["target"] == 2759
    assert maintain["protein_g"] == 144  # 1.8 g/kg — protein-forward
    assert maintain["fibre_g"] == 39  # ~14 g / 1000 kcal
    assert (maintain["target_low"], maintain["target_high"]) == (2659, 2859)  # a ±100 band
    assert maintain["bmi"] == 24.7 and maintain["bmi_category"] == "healthy"
    assert (maintain["healthy_low"], maintain["healthy_high"]) == (59.9, 80.7)

    loss = nutrition.targets(**base, activity="moderate", goal="gentle_loss")
    gain = nutrition.targets(**base, activity="moderate", goal="gentle_gain")
    # Gentle, and never a crash: a loss target stays at or above resting burn.
    assert maintain["bmr"] <= loss["target"] < maintain["target"] < gain["target"]


def test_goal_weight_drives_the_direction():
    base = dict(sex="male", age=30, height_cm=180, weight_kg=80, activity="moderate")
    # Want to weigh less → a gentle deficit; want more → a surplus; within 1 kg → maintain.
    assert nutrition.targets(**base, goal_weight_kg=70)["target"] < nutrition.targets(**base)["target"]
    assert nutrition.targets(**base, goal_weight_kg=90)["target"] > nutrition.targets(**base)["target"]
    assert nutrition.targets(**base, goal_weight_kg=80)["target"] == nutrition.targets(**base)["target"]
    assert nutrition.targets(**base, goal_weight_kg=70)["goal_weight"] == 70


def test_bmi_and_healthy_range():
    assert nutrition.bmi(163, 76) == 28.6 and nutrition.bmi_category(28.6) == "overweight"
    lo, hi = nutrition.healthy_weight_range(163)
    assert lo == 49.2 and hi == 66.2  # 163 cm → ~49–66 kg is a healthy BMI


def test_daily_suggestions_rotate_and_cover_tags():
    a = nutrition.daily_suggestions("2026-07-18")
    assert a == nutrition.daily_suggestions("2026-07-18")  # stable within a day
    assert {s["tag"] for s in a} == {"protein", "fibre", "meal"}
    assert all(s["kcal"] > 0 and s["name"] for s in a)


def test_country_swaps_in_a_local_library():
    day = "2026-07-18"
    world = nutrition.daily_suggestions(day)
    ph = nutrition.daily_suggestions(day, "PH")
    world_names = {n for (n, *_rest) in nutrition.SUGGESTIONS}
    ph_names = {n for (n, *_rest) in nutrition.SUGGESTIONS_PH}
    # Every PH pick is drawn from the PH library; every worldwide pick from the world one.
    assert all(s["name"] in ph_names for s in ph)
    assert all(s["name"] in world_names for s in world)
    assert ph != world  # localisation actually changed the board
    # Same shape either way, and an unknown country falls back to worldwide.
    assert {s["tag"] for s in ph} == {"protein", "fibre", "meal"}
    assert nutrition.daily_suggestions(day, "zz") == world
    assert nutrition.daily_suggestions(day, "ph") == ph  # case-insensitive


def test_unspecified_sex_lands_between_male_and_female():
    args = dict(age=30, height_cm=180, weight_kg=80)
    m = nutrition.bmr("male", **args)
    f = nutrition.bmr("female", **args)
    u = nutrition.bmr("unspecified", **args)
    assert f < u < m


def test_parse_products_normalises_and_drops_bad_rows():
    payload = {
        "products": [
            {"product_name": "Rolled Oats", "brands": "Quaker, Store",
             "nutriments": {"energy-kcal_100g": 389, "proteins_100g": 16.9, "fiber_100g": 10.6},
             "serving_size": "40 g"},
            {"product_name": "", "nutriments": {"energy-kcal_100g": 100}},   # no name → drop
            {"product_name": "Mystery", "nutriments": {}},                    # no calories → drop
            {"product_name": "KJ Only", "nutriments": {"energy_100g": 1000}},  # kJ → kcal fallback
        ]
    }
    items = nutrition._parse_products(payload)
    assert [i["name"] for i in items] == ["Rolled Oats", "KJ Only"]
    oats = items[0]
    assert oats["kcal_100g"] == 389 and oats["protein_100g"] == 17 and oats["brand"] == "Quaker"
    assert oats["fibre_100g"] == 11  # 10.6 rounded
    assert items[1]["kcal_100g"] == 239 and items[1]["fibre_100g"] == 0  # 1000 kJ / 4.184


def test_parse_products_respects_limit():
    payload = {"products": [
        {"product_name": f"Food {i}", "nutriments": {"energy-kcal_100g": 100}} for i in range(50)
    ]}
    assert len(nutrition._parse_products(payload, limit=5)) == 5
