"""Nutrition: a gentle calorie/protein target and a food-database lookup.

Two parts, both deliberately un-obsessive:

  • `targets()` — pure math. Mifflin–St Jeor BMR → TDEE → a target *range*
    (never a single hard number), with only sensible goals (maintain, or a gentle
    ~15 % deficit / ~10 % surplus — never a crash diet; a loss target is floored at
    BMR so it can't drop dangerously low). This is an estimate, not medical or
    nutrition advice.
  • `search()` — looks a food up in Open Food Facts (free, no API key, off the
    user's own always-on Mac). The HTTP lives here; `_parse_products` is pure so it
    can be tested without a network. Values are normalised to per-100 g; the caller
    logs the grams eaten and we scale from there, so the calorie count is precise.

Only stdlib (urllib) is used, matching llm.py, so it runs under launchd with no
extra dependencies.
"""

import hashlib

from . import net

# ── Targets (pure) ────────────────────────────────────────────────────────────

ACTIVITY_FACTORS: dict[str, float] = {
    "sedentary": 1.2,      # desk job, little exercise
    "light": 1.375,        # light exercise 1–3 days/week
    "moderate": 1.55,      # 3–5 days/week
    "active": 1.725,       # 6–7 days/week
    "very_active": 1.9,    # hard training / physical job
}

GOALS = ("maintain", "gentle_loss", "gentle_gain")

# Grams of protein per kg of bodyweight. The evidence range is ~1.2–2.2 g/kg;
# 1.8 leans high on purpose — protein keeps you full and protects muscle in a
# gentle deficit, which is what this user is after.
PROTEIN_PER_KG = 1.8

# Fibre target scales with intake: ~14 g per 1000 kcal is the standard guideline.
FIBRE_PER_1000KCAL = 14


def bmi(height_cm: float, weight_kg: float) -> float:
    """Body-mass index. 0 when the inputs aren't set yet."""
    if height_cm <= 0 or weight_kg <= 0:
        return 0.0
    h = height_cm / 100
    return round(weight_kg / (h * h), 1)


def bmi_category(value: float) -> str:
    if value <= 0:
        return "unknown"
    if value < 18.5:
        return "underweight"
    if value < 25:
        return "healthy"
    if value < 30:
        return "overweight"
    return "obese"


def healthy_weight_range(height_cm: float) -> tuple[float, float]:
    """The weight range for a healthy BMI (18.5–24.9) at this height, in kg."""
    if height_cm <= 0:
        return (0.0, 0.0)
    h = height_cm / 100
    return (round(18.5 * h * h, 1), round(24.9 * h * h, 1))


def bmr(sex: str, age: int, height_cm: float, weight_kg: float) -> float:
    """Resting energy (kcal/day) via Mifflin–St Jeor. `sex` is 'male' / 'female';
    anything else uses the average of the two constants, so it still gives a
    reasonable estimate without forcing a choice."""
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    offset = {"male": 5, "female": -161}.get(sex, -78)  # -78 = midpoint of +5/-161
    return base + offset


def targets(sex: str, age: int, height_cm: float, weight_kg: float,
            activity: str, goal: str = "maintain", goal_weight_kg: float = 0) -> dict:
    """The full picture: resting burn, maintenance, a gentle target *range*, BMI,
    and where a healthy weight sits.

    When `goal_weight_kg` is set it drives the direction (a gentle deficit if
    you're above it, a gentle surplus if below, maintenance within ~1 kg) — more
    intuitive than an abstract goal. Otherwise the `goal` enum is used.

    Returns bmr, tdee, target (midpoint), target_low/target_high (a ±100 kcal band
    to aim inside, never a line you fail at), protein_g, fibre_g, bmi,
    bmi_category, healthy_low/healthy_high, and the goal_weight echoed back."""
    resting = bmr(sex, age, height_cm, weight_kg)
    tdee = resting * ACTIVITY_FACTORS.get(activity, 1.2)

    direction = goal
    if goal_weight_kg and weight_kg:
        if weight_kg - goal_weight_kg > 1:
            direction = "gentle_loss"
        elif goal_weight_kg - weight_kg > 1:
            direction = "gentle_gain"
        else:
            direction = "maintain"

    if direction == "gentle_loss":
        target = max(tdee * 0.85, resting)  # ~15 % deficit, never below resting burn
    elif direction == "gentle_gain":
        target = tdee * 1.10                # ~10 % surplus
    else:
        target = tdee
    target = round(target)

    low, high = healthy_weight_range(height_cm)
    value = bmi(height_cm, weight_kg)
    return {
        "bmr": round(resting),
        "tdee": round(tdee),
        "target": target,
        "target_low": target - 100,
        "target_high": target + 100,
        "protein_g": round(PROTEIN_PER_KG * weight_kg),
        "fibre_g": round(target / 1000 * FIBRE_PER_1000KCAL),
        "bmi": value,
        "bmi_category": bmi_category(value),
        "healthy_low": low,
        "healthy_high": high,
        "goal_weight": round(goal_weight_kg, 1) if goal_weight_kg else 0,
    }


# ── Food lookup (Open Food Facts) ───────────────────────────────────────────────

_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"


def _kcal_100g(nutriments: dict) -> int | None:
    """Calories per 100 g. Prefer the kcal field; fall back to kJ (÷4.184)."""
    kcal = nutriments.get("energy-kcal_100g")
    if kcal is None:
        kj = nutriments.get("energy_100g")  # usually kJ
        kcal = kj / 4.184 if isinstance(kj, (int, float)) else None
    return round(kcal) if isinstance(kcal, (int, float)) and kcal > 0 else None


def _parse_products(payload: dict, limit: int = 20) -> list[dict]:
    """Pure: Open Food Facts JSON → normalised per-100 g items. Drops entries
    with no name or no usable calorie figure."""
    out: list[dict] = []
    for p in payload.get("products", []):
        name = (p.get("product_name") or "").strip()
        if not name:
            continue
        kcal = _kcal_100g(p.get("nutriments") or {})
        if kcal is None:
            continue
        nutr = p.get("nutriments") or {}
        protein = nutr.get("proteins_100g")
        fibre = nutr.get("fiber_100g")
        out.append({
            "name": name,
            "brand": (p.get("brands") or "").split(",")[0].strip(),
            "kcal_100g": kcal,
            "protein_100g": round(protein) if isinstance(protein, (int, float)) else 0,
            "fibre_100g": round(fibre) if isinstance(fibre, (int, float)) else 0,
            "serving_size": (p.get("serving_size") or "").strip(),
        })
        if len(out) >= limit:
            break
    return out


def search(query: str, timeout: float = 8.0, limit: int = 20) -> list[dict]:
    """Search Open Food Facts for a food. Returns normalised per-100 g items.
    Raises on any transport/parse error; the route turns that into a clean 502."""
    q = (query or "").strip()
    if not q:
        return []
    payload = net.get_json(_SEARCH_URL, params={
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": limit,
        "fields": "product_name,brands,nutriments,serving_size",
    }, headers={"User-Agent": "Arise-Wellness/1.0 (personal use)"}, timeout=timeout)
    return _parse_products(payload, limit)


# ── What to eat: curated protein- & fibre-forward suggestions ────────────────────
# Each is (name, serving, kcal, protein_g, fibre_g, tag). Tags: 'protein' (protein
# stars), 'fibre' (fibre stars), 'meal' (balanced high-protein + high-fibre plates).
# Values are typical per-serving estimates — enough to log quickly and to see why
# a food earns its place. Tap one in the app to add it to the day's log.
SUGGESTIONS: list[tuple[str, str, int, int, int, str]] = [
    # Protein-forward
    ("Greek yoghurt (plain, 200 g)", "200 g", 130, 20, 0, "protein"),
    ("Chicken breast (150 g, cooked)", "150 g", 250, 47, 0, "protein"),
    ("Two eggs", "2 eggs", 155, 13, 0, "protein"),
    ("Cottage cheese (150 g)", "150 g", 145, 17, 0, "protein"),
    ("Canned tuna (in water, 100 g)", "100 g", 115, 26, 0, "protein"),
    ("Tofu, firm (150 g)", "150 g", 180, 17, 2, "protein"),
    ("Edamame (150 g)", "150 g", 190, 18, 8, "protein"),
    ("Whey protein shake", "1 scoop + water", 120, 24, 1, "protein"),
    ("Salmon fillet (120 g)", "120 g", 250, 25, 0, "protein"),
    ("Prawns (150 g)", "150 g", 150, 30, 0, "protein"),
    # Fibre-forward
    ("Rolled oats (60 g dry)", "60 g", 230, 8, 6, "fibre"),
    ("Black beans (150 g cooked)", "150 g", 195, 12, 12, "fibre"),
    ("Chickpeas (150 g cooked)", "150 g", 205, 11, 11, "fibre"),
    ("Lentils (150 g cooked)", "150 g", 175, 13, 12, "fibre"),
    ("Raspberries (150 g)", "150 g", 80, 2, 10, "fibre"),
    ("Chia seeds (2 tbsp)", "2 tbsp", 140, 5, 10, "fibre"),
    ("Avocado (half)", "1/2", 160, 2, 7, "fibre"),
    ("Broccoli (200 g)", "200 g", 70, 6, 5, "fibre"),
    ("Apple with skin", "1 medium", 95, 0, 4, "fibre"),
    ("Wholegrain bread (2 slices)", "2 slices", 160, 8, 6, "fibre"),
    ("Sweet potato (200 g baked)", "200 g", 180, 4, 6, "fibre"),
    ("Almonds (30 g)", "30 g", 175, 6, 4, "fibre"),
    # Balanced meals — high protein AND high fibre (ideal for a gentle deficit)
    ("Chicken, quinoa & broccoli bowl", "1 bowl", 480, 40, 10, "meal"),
    ("Lentil & veg curry + brown rice", "1 plate", 520, 22, 16, "meal"),
    ("Greek yoghurt + berries + chia", "1 bowl", 320, 24, 12, "meal"),
    ("Tofu stir-fry with edamame & veg", "1 plate", 450, 28, 12, "meal"),
    ("Salmon, sweet potato & greens", "1 plate", 520, 34, 9, "meal"),
    ("Black-bean & egg breakfast wrap", "1 wrap", 420, 24, 11, "meal"),
    ("Chickpea & tuna salad", "1 bowl", 400, 32, 12, "meal"),
    ("Overnight oats + whey + berries", "1 jar", 420, 32, 11, "meal"),
]


# Philippines set — same protein/fibre focus, but everyday Cebu staples you can
# actually find in a palengke or local supermarket, so the picks aren't wasted on
# foods that aren't around. Same (name, serving, kcal, protein_g, fibre_g, tag).
SUGGESTIONS_PH: list[tuple[str, str, int, int, int, str]] = [
    # Protein-forward
    ("Chicken breast, grilled (150 g)", "150 g", 250, 47, 0, "protein"),
    ("Boiled eggs (2)", "2 eggs", 155, 13, 0, "protein"),
    ("Bangus (milkfish), grilled (150 g)", "150 g", 220, 30, 0, "protein"),
    ("Tilapia, grilled (150 g)", "150 g", 195, 34, 0, "protein"),
    ("Canned tuna in water (100 g)", "100 g", 115, 26, 0, "protein"),
    ("Tokwa (firm tofu, 150 g)", "150 g", 180, 17, 2, "protein"),
    ("Lean pork, grilled (120 g)", "120 g", 250, 30, 0, "protein"),
    ("Greek yoghurt, plain (200 g)", "200 g", 130, 20, 0, "protein"),
    ("Pusit (squid), grilled (150 g)", "150 g", 140, 24, 0, "protein"),
    ("Hipon (shrimp, 150 g)", "150 g", 150, 30, 0, "protein"),
    # Fibre-forward
    ("Monggo (mung beans, 150 g cooked)", "150 g", 160, 12, 11, "fibre"),
    ("Brown rice (1 cup cooked)", "1 cup", 215, 5, 4, "fibre"),
    ("Saba banana, boiled (1)", "1", 120, 1, 4, "fibre"),
    ("Kamote (sweet potato, 200 g)", "200 g", 180, 4, 6, "fibre"),
    ("Rolled oats (60 g dry)", "60 g", 230, 8, 6, "fibre"),
    ("Kangkong, sautéed (150 g)", "150 g", 60, 3, 4, "fibre"),
    ("Malunggay leaves, cooked (100 g)", "100 g", 60, 5, 4, "fibre"),
    ("Okra, steamed (150 g)", "150 g", 50, 3, 5, "fibre"),
    ("Garbanzos (chickpeas, 150 g)", "150 g", 205, 11, 11, "fibre"),
    ("Ripe mango (1 medium)", "1 medium", 135, 1, 4, "fibre"),
    ("Corn / mais (1 cob)", "1 cob", 125, 4, 4, "fibre"),
    ("Ampalaya, sautéed (150 g)", "150 g", 50, 2, 4, "fibre"),
    # Balanced meals — high protein AND high fibre
    ("Chicken tinola with malunggay + rice", "1 bowl", 480, 38, 8, "meal"),
    ("Ginisang monggo with veg", "1 bowl", 350, 20, 14, "meal"),
    ("Tinolang isda (fish) with veg", "1 bowl", 380, 32, 6, "meal"),
    ("Tokwa & veg stir-fry + brown rice", "1 plate", 450, 24, 10, "meal"),
    ("Grilled tilapia + kamote + kangkong", "1 plate", 470, 36, 9, "meal"),
    ("Adobong kangkong + egg + rice", "1 plate", 420, 18, 8, "meal"),
    ("Greek yoghurt + banana + oats", "1 bowl", 340, 22, 8, "meal"),
    ("Ginisang monggo + tilapia + rice", "1 plate", 520, 34, 14, "meal"),
]

# Region code (from the body profile) → its library. Anything unset/unknown falls
# back to the worldwide set, so nothing ever breaks on a new country.
_LIBRARIES: dict[str, list[tuple[str, str, int, int, int, str]]] = {
    "PH": SUGGESTIONS_PH,
}


def _suggest_item(t: tuple) -> dict:
    name, serving, kcal, protein, fibre, tag = t
    return {"name": name, "serving": serving, "kcal": kcal,
            "protein_g": protein, "fibre_g": fibre, "tag": tag}


def daily_suggestions(day: str, country: str = "", per_tag: int = 4) -> list[dict]:
    """A rotating slice of the library for `day` — a few protein picks, a few
    fibre picks, and a couple of meal ideas. Deterministic per day (md5), so the
    board is stable through the day and fresh tomorrow, exactly like the quests.

    `country` (e.g. 'PH') swaps in a locally-available set when we have one, so the
    picks are things you can actually buy; otherwise the worldwide set is used."""
    library = _LIBRARIES.get((country or "").upper(), SUGGESTIONS)
    out: list[dict] = []
    for tag, n in (("meal", 3), ("protein", per_tag), ("fibre", per_tag)):
        pool = [s for s in library if s[5] == tag]
        if not pool:
            continue
        start = int(hashlib.md5(f"{tag}:{day}".encode()).hexdigest(), 16) % len(pool)
        picks = [pool[(start + i) % len(pool)] for i in range(min(n, len(pool)))]
        out.extend(_suggest_item(p) for p in picks)
    return out
