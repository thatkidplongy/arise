"""Skincare — a gentle, consistency-first routine, tuned for pigmentation & pores.

Skincare is all about *consistency*, which is exactly what Arise is good at. The
routine is a per-player, editable AM/PM checklist (see models.SkincareStep),
seeded once from the template below and yours to change afterwards.

There's also a product lookup (`lookup`): search Open Beauty Facts (free, no API
key — the sister project of Open Food Facts) for a product, read its ingredients,
and flag the actives that help pigmentation & pores. A formula is the same wherever
you buy it, so this searches worldwide (Open Beauty Facts has little country data).
The HTTP lives here; `analyse_ingredients` / `_parse_products` are pure, so they're
tested without a network. Only stdlib (urllib) is used, matching nutrition.py.

This is a sensible, widely-recommended *framework*, not a medical prescription:
the single highest-impact thing for pigmentation is daily sunscreen; introduce
one active at a time and patch-test. Persistent pigmentation (melasma,
post-inflammatory marks) can have causes that need a dermatologist — see NOTE.
"""

import json
import urllib.parse
import urllib.request

# Seeded once per player, in order. Each is (routine, text).
TEMPLATE: list[tuple[str, str]] = [
    # ── Morning: protect ──────────────────────────────────────────────────────
    ("AM", "Gentle cleanser (or just rinse with water)"),
    ("AM", "Vitamin C serum — brightening antioxidant (optional)"),
    ("AM", "Niacinamide — helps tone & the look of pores (optional)"),
    ("AM", "Moisturiser"),
    ("AM", "Sunscreen SPF 50 — every morning; the #1 step for pigmentation"),
    # ── Evening: repair ───────────────────────────────────────────────────────
    ("PM", "Cleanser (double-cleanse if you wore SPF or makeup)"),
    ("PM", "Treatment — pick ONE, alternate nights: azelaic acid or niacinamide "
           "(pigmentation) · BHA/salicylic acid (pores) · a retinoid (both)"),
    ("PM", "Moisturiser"),
]

# Trusted places to learn, shown under the routine (medium: 🎥 video · 🌐 site).
RESOURCES: list[str] = [
    "🎥 Dr Dray (YouTube) — evidence-based dermatologist",
    "🌐 INCIDecoder (incidecoder.com) — look up any product's ingredients",
    "🌐 r/SkincareAddiction wiki — routine & ingredient basics",
]

# Shown once, gently, near the routine.
NOTE: str = (
    "This is a general starting point, not medical advice. Introduce one active "
    "at a time, patch-test, and wear sunscreen daily. For pigmentation that "
    "won't budge (e.g. melasma or dark marks), a dermatologist can tailor a plan "
    "— some causes need prescription treatment."
)


# ── Product lookup (Open Beauty Facts) ────────────────────────────────────────
_SEARCH_URL = "https://world.openbeautyfacts.org/cgi/search.pl"

# Actives worth calling out, tuned for this user's pigmentation & pores goals.
# Each rule is (label, detail, keywords); a keyword is a lower-cased substring of
# the INCI list. The label is added once if any of its keywords appears. Order is
# the order we show them (sunscreen first — it's the #1 step for pigmentation).
_HELPFUL: list[tuple[str, str, tuple[str, ...]]] = [
    ("Sunscreen filter", "sun protection — the #1 step for pigmentation",
     ("zinc oxide", "titanium dioxide", "avobenzone", "octocrylene", "homosalate",
      "methoxycinnamate", "octinoxate", "octisalate", "ethylhexyl salicylate",
      "tinosorb", "uvinul", "mexoryl", "bemotrizinol", "bisoctrizole", "ensulizole")),
    ("Niacinamide", "evens tone & softens the look of pores", ("niacinamide", "nicotinamide")),
    ("Azelaic acid", "fades pigmentation & calms redness", ("azelaic", "azeloyl")),
    ("Vitamin C", "brightening antioxidant", ("ascorb",)),
    ("Retinoid", "cell turnover — pigmentation & texture", ("retinol", "retinal", "retinyl", "retinoate", "adapalene")),
    ("Salicylic acid (BHA)", "gets into pores & unclogs them", ("salicyl",)),
    ("AHA", "gentle exfoliation & glow", ("glycolic", "lactic acid", "mandelic")),
    ("Tranexamic acid", "targets stubborn pigmentation", ("tranexamic",)),
    ("Alpha-arbutin", "brightens dark marks", ("arbutin",)),
    ("Hyaluronic acid", "lightweight hydration", ("hyaluron",)),
    ("Ceramides", "supports your skin barrier", ("ceramide",)),
]

# Not "bad" — just worth knowing if your skin runs sensitive.
_WATCH: list[tuple[str, str, tuple[str, ...]]] = [
    ("Fragrance", "a common irritant — fine if your skin tolerates it", ("parfum", "fragrance")),
    ("Drying alcohol", "can feel stripping on sensitive skin", ("alcohol denat", "sd alcohol", "denatured alcohol")),
]


def analyse_ingredients(ingredients: str) -> dict:
    """Pure: an INCI ingredient string → the actives worth flagging for
    pigmentation & pores, plus a gentle 'worth knowing' list. Fatty alcohols
    (cetyl, cetearyl…) are deliberately not matched as 'drying alcohol'."""
    low = (ingredients or "").lower()
    helpful = [{"label": lbl, "detail": det}
               for (lbl, det, keys) in _HELPFUL if any(k in low for k in keys)]
    watch = [{"label": lbl, "detail": det}
             for (lbl, det, keys) in _WATCH if any(k in low for k in keys)]
    return {"helpful": helpful, "watch": watch}


def _parse_products(payload: dict, limit: int = 8) -> list[dict]:
    """Pure: Open Beauty Facts JSON → products with a read of their ingredients.
    Drops entries with no name or no ingredient list (nothing useful to show)."""
    out: list[dict] = []
    for p in payload.get("products", []):
        name = (p.get("product_name") or "").strip()
        ingredients = (p.get("ingredients_text_en") or p.get("ingredients_text") or "").strip()
        if not name or not ingredients:
            continue
        analysis = analyse_ingredients(ingredients)
        out.append({
            "name": name[:80],
            "brand": (p.get("brands") or "").split(",")[0].strip()[:40],
            "ingredients": ingredients[:600],
            "helpful": analysis["helpful"],
            "watch": analysis["watch"],
        })
        if len(out) >= limit:
            break
    return out


def lookup(query: str, timeout: float = 8.0, limit: int = 8) -> list[dict]:
    """Search Open Beauty Facts for a product and read its ingredients. Raises on
    any transport/parse error; the route turns that into a clean 502."""
    q = (query or "").strip()
    if not q:
        return []
    params = urllib.parse.urlencode({
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": limit,
        "fields": "product_name,brands,ingredients_text,ingredients_text_en",
    })
    req = urllib.request.Request(
        f"{_SEARCH_URL}?{params}",
        headers={"User-Agent": "Arise-Wellness/1.0 (personal use)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    return _parse_products(payload, limit)
