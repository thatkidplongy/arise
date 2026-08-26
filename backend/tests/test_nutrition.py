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


# ── Plates: hands, not grams ──────────────────────────────────────────────────


def _plate(**portions) -> dict:
    return {f"{k}_p": v for k, v in portions.items()}


def test_a_plate_estimates_to_a_range_never_a_number():
    # The whole point: a palm of grilled fish and a palm of crispy pata are the
    # same gesture, so what comes back is a spread you can trust, not a figure
    # you'd have to invent.
    low, high = nutrition.estimate([_plate(protein=1, veg=1, carb=2)])
    assert low < high
    assert low > 0
    # Rounded outwards to the nearest 50 — a range printed to the last digit
    # claims a precision hand portions don't have.
    assert low % 50 == 0 and high % 50 == 0


def test_a_days_spread_is_narrower_than_stacking_worst_cases():
    # Independent errors partly cancel: assuming every portion was simultaneously
    # the biggest one isn't honesty, it's a band so wide it says nothing.
    day = [_plate(protein=1, veg=1, carb=1) for _ in range(4)]
    low, high = nutrition.estimate(day)
    one_low, one_high = nutrition.estimate([day[0]])
    assert high - low < 4 * (one_high - one_low)


def test_grams_are_rounded_finer_than_calories():
    # Rounding a fibre range to the nearest 50 rounds an honest day to "0–50",
    # which says nothing at all — each figure gets a step its own size.
    day = [_plate(veg=2, carb=2) for _ in range(3)]
    fibre_low, fibre_high = nutrition.estimate(day, "fibre_g")
    assert fibre_low > 0
    assert fibre_low % 5 == 0 and fibre_high % 5 == 0
    assert nutrition.estimate(day, "kcal")[0] % 50 == 0


def test_a_food_that_came_with_numbers_keeps_them():
    # A packaged food weighed off its own label is close; a typed guess is not,
    # and the spread says so.
    weighed = nutrition.estimate([{"kcal": 400, "grams": 100}])
    guessed = nutrition.estimate([{"kcal": 400, "grams": 0}])
    assert weighed[1] - weighed[0] < guessed[1] - guessed[0]
    assert weighed[0] <= 400 <= weighed[1]


def test_portions_win_over_any_numbers_on_the_same_row():
    # A plate logged in hands is the measurement; anything else on the row would
    # be double-counting the same food.
    hands_only = nutrition.estimate([_plate(protein=2, carb=2)])
    both = nutrition.estimate([{**_plate(protein=2, carb=2), "kcal": 900}])
    assert hands_only == both


def test_cooking_fat_is_counted_on_a_cooked_plate_but_not_a_lone_snack():
    # Oil, butter and sauce are the main reason a bought plate runs higher than it
    # looks — and there's none of it in a glass of iced tea.
    meal = nutrition.estimate([_plate(protein=1)])
    snack = nutrition.estimate([_plate(extra=1)])
    bare = nutrition._combine([nutrition.PORTION["protein"]["kcal"]])
    assert meal[0] > bare[0]
    assert snack == nutrition._combine([nutrition.PORTION["extra"]["kcal"]])


def test_plate_targets_are_the_hunters_own_numbers_in_hands():
    t = nutrition.targets("male", 30, 175, 78, "moderate", goal_weight_kg=72)
    plate = nutrition.plate_targets(t)
    # Protein palms come straight off the gram target — a palm is ~28 g of it.
    assert plate["protein"] == round(t["protein_g"] / nutrition.PALM_PROTEIN_G)
    assert plate["veg"] == nutrition.VEG_FISTS
    # Starch is what the band has left once protein, veg and the unseen fat are paid.
    assert 2 <= plate["carb"] <= 6
    assert plate["extra"] == nutrition.EXTRA_CAP
    # No profile, no plan — in grams or in hands.
    assert nutrition.plate_targets(None) == {}


def test_plate_targets_land_near_the_band_they_came_from():
    # If the hands added up to something far off the calorie target, they'd be a
    # different plan wearing the same name.
    t = nutrition.targets("male", 30, 175, 78, "moderate", goal_weight_kg=72)
    plate = nutrition.plate_targets(t)
    low, high = nutrition.estimate([{f"{u}_p": plate[u] for u in ("protein", "veg", "carb")}])
    assert low <= t["target"] <= high + nutrition.UNSEEN_SHARE * t["target"]


def test_usuals_rank_by_repetition_and_ignore_one_off_packages():
    rows = [
        {"name": "Silog", **_plate(protein=1, carb=2)},
        {"name": "silog", **_plate(protein=1, carb=1)},  # same place, smaller rice
        {"name": "Tinola", **_plate(protein=1, veg=2)},
        {"name": "Protein bar", "kcal": 220, "grams": 60},  # nothing to repeat
    ]
    usuals = nutrition.usuals(rows)
    assert [u["name"] for u in usuals] == ["Silog", "Tinola"]
    assert usuals[0]["count"] == 2
    # The latest logging wins: what you eat there now beats what you ate in March.
    assert usuals[0]["carb"] == 1


def test_plate_line_says_the_day_in_hands():
    totals = nutrition.plate_totals([_plate(protein=2, veg=1), _plate(carb=3)])
    assert nutrition.plate_line(totals) == "2 palms · 1 fist · 3 cupped hands"
    assert nutrition.plate_line(nutrition.plate_totals([])) == ""
