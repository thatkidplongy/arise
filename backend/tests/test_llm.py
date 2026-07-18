"""Unit tests for the pure bits of the LLM layer (no network)."""

import json

from app import llm


def _payload(obj: dict) -> dict:
    """Wrap an estimate object in the shape Gemini's API returns."""
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]}


def test_parse_estimate_normalises_numbers():
    est = llm._parse_estimate(_payload({
        "name": "  Chicken salad ", "kcal": 420.6, "protein_g": "38", "fibre_g": 9,
        "note": "assumed 1 bowl", "source": "food",
    }))
    assert est["name"] == "Chicken salad"  # trimmed
    assert est["kcal"] == 421 and est["protein_g"] == 38 and est["fibre_g"] == 9
    assert est["note"] == "assumed 1 bowl" and est["source"] == "food"


def test_parse_estimate_reads_a_label_source():
    est = llm._parse_estimate(_payload({
        "name": "Oat crackers", "kcal": 130, "protein_g": 3, "fibre_g": 2,
        "note": "per serving (30 g); 5 servings per pack", "source": "LABEL",
    }))
    assert est["source"] == "label"  # normalised to lower-case


def test_parse_estimate_handles_missing_and_bad_values():
    est = llm._parse_estimate(_payload({"name": "", "kcal": None, "protein_g": "oops"}))
    assert est["name"] == "Meal"  # fallback
    assert est["kcal"] == 0 and est["protein_g"] == 0 and est["fibre_g"] == 0
    assert est["note"] == "" and est["source"] == ""
