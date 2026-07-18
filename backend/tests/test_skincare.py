"""Unit tests for the pure Open Beauty Facts parsing + ingredient read."""

from app import skincare


def test_analyse_flags_helpful_actives_for_pigmentation_and_pores():
    # A well-stocked routine-in-a-bottle.
    text = ("Aqua, Niacinamide, Ascorbic Acid, Azelaic Acid, Retinol, "
            "Salicylic Acid, Glycolic Acid, Sodium Hyaluronate, Ceramide NP, "
            "Zinc Oxide, Tranexamic Acid, Alpha-Arbutin")
    a = skincare.analyse_ingredients(text)
    labels = {h["label"] for h in a["helpful"]}
    assert {"Niacinamide", "Vitamin C", "Azelaic acid", "Retinoid",
            "Salicylic acid (BHA)", "AHA", "Hyaluronic acid", "Ceramides",
            "Sunscreen filter", "Tranexamic acid", "Alpha-arbutin"} <= labels
    # Every flagged active carries a one-line reason.
    assert all(h["detail"] for h in a["helpful"])


def test_analyse_watch_list_and_no_false_positives():
    # Fragrance + a drying alcohol are surfaced gently…
    watched = skincare.analyse_ingredients("Aqua, Parfum, Alcohol Denat., Limonene")
    assert {w["label"] for w in watched["watch"]} == {"Fragrance", "Drying alcohol"}

    # …but a fatty alcohol (cetearyl) is NOT called a drying alcohol, and plain
    # water flags nothing at all.
    clean = skincare.analyse_ingredients("Aqua, Cetearyl Alcohol, Glycerin")
    assert clean["watch"] == []
    assert clean["helpful"] == []


def test_parse_products_drops_rows_without_name_or_ingredients():
    payload = {"products": [
        {"product_name": "CeraVe Lotion", "brands": "CeraVe, Store",
         "ingredients_text": "Aqua, Niacinamide, Ceramide NP"},
        {"product_name": "", "ingredients_text": "Aqua"},          # no name → drop
        {"product_name": "Mystery", "ingredients_text": ""},        # no ingredients → drop
        {"product_name": "EN only", "ingredients_text_en": "Aqua, Retinol"},
    ]}
    items = skincare._parse_products(payload)
    assert [i["name"] for i in items] == ["CeraVe Lotion", "EN only"]
    assert items[0]["brand"] == "CeraVe"  # first brand only
    assert {h["label"] for h in items[0]["helpful"]} == {"Niacinamide", "Ceramides"}
    assert items[1]["helpful"][0]["label"] == "Retinoid"  # reads the _en field


def test_parse_products_respects_limit():
    payload = {"products": [
        {"product_name": f"P{i}", "ingredients_text": "Aqua"} for i in range(30)
    ]}
    assert len(skincare._parse_products(payload, limit=5)) == 5
