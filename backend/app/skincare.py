"""Skincare — a gentle, consistency-first routine, tuned for pigmentation & pores.

Skincare is all about *consistency*, which is exactly what Arise is good at. The
routine is a per-player, editable AM/PM checklist (see models.SkincareStep),
seeded once from the template below and yours to change afterwards.

This is a sensible, widely-recommended *framework*, not a medical prescription:
the single highest-impact thing for pigmentation is daily sunscreen; introduce
one active at a time and patch-test. Persistent pigmentation (melasma,
post-inflammatory marks) can have causes that need a dermatologist — see NOTE.
"""

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
