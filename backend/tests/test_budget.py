"""The budget: monthly take-home pay plus the standing commitments it's divided
across. /state carries these *raw* — the 50/30/20 targets and the derived savings
figure are computed on the client, so nothing here asserts percentages."""

DAY = "2026-08-05"


def _budget(client, day=DAY):
    return client.get(f"/state?day={day}").json()["budget"]


def _add(client, label, amount, bucket, **kw):
    body = {"label": label, "amount": amount, "bucket": bucket, **kw}
    return client.post(f"/budget/commitments?day={DAY}", json=body)


def test_starts_empty_and_income_stamps_the_start_month(client):
    assert _budget(client) == {
        "monthly_income": 0,
        "start_month": "",
        "month": "2026-08",
        "commitments": [],
        "actual": {"income": 0, "needs": 0, "wants": 0, "untagged": 0},
    }

    b = client.put(f"/budget/income?day={DAY}", json={"monthly_income": 45000}).json()["budget"]
    assert b["monthly_income"] == 45000
    assert b["start_month"] == "2026-08"  # the month the budget began

    # Changing pay later must not re-stamp the start month — history stays anchored.
    b = client.put("/budget/income?day=2026-11-02", json={"monthly_income": 52000}).json()["budget"]
    assert b["monthly_income"] == 52000 and b["start_month"] == "2026-08"


def test_income_of_zero_leaves_the_budget_unstarted(client):
    b = client.put(f"/budget/income?day={DAY}", json={"monthly_income": 0}).json()["budget"]
    assert b["monthly_income"] == 0 and b["start_month"] == ""


def test_setting_pay_is_only_a_setting_money_moves_when_paydays_land(client):
    # The pay amount is a plan; it never moves money on its own. The app follows the
    # money: only logged paydays count as income.
    client.put(f"/budget/income?day={DAY}", json={"monthly_income": 40750})
    s = client.get(f"/state?day={DAY}").json()
    assert s["money"]["balance"] == 0
    assert s["budget"]["actual"]["income"] == 0
    assert client.get(f"/money/history?scope=month&day={DAY}").json()["entries"] == []

    # First payday lands and is logged — income and balance follow it.
    client.post(f"/money?day={DAY}", json={"amount": 40750, "direction": "in", "note": "Payday"})
    s = client.get(f"/state?day={DAY}").json()
    assert s["money"]["balance"] == 40750
    assert s["budget"]["actual"]["income"] == 40750

    # Second payday later in the month stacks on top: two entries, doubled income.
    client.post("/money?day=2026-08-20", json={"amount": 40750, "direction": "in", "note": "Payday"})
    s = client.get("/state?day=2026-08-20").json()
    assert s["money"]["balance"] == 81500
    assert s["budget"]["actual"]["income"] == 81500


def test_commitments_are_the_worksheet_line_items(client):
    _add(client, "Rent", 12000, "needs", due_day=5)
    _add(client, "Internet", 1699, "needs", due_day=10)
    _add(client, "Groceries", 6000, "needs", variable=True)
    b = _add(client, "Eating out", 3000, "wants").json()["budget"]

    # Dated bills in due order first, then the undated allowances in entry order.
    assert [c["label"] for c in b["commitments"]] == ["Rent", "Internet", "Groceries", "Eating out"]
    rent = b["commitments"][0]
    assert rent["amount"] == 12000 and rent["bucket"] == "needs" and rent["due_day"] == 5
    assert rent["variable"] is False and rent["active"] is True
    # A grocery allowance is a commitment whose real amount moves month to month.
    assert next(c for c in b["commitments"] if c["label"] == "Groceries")["variable"] is True
    assert next(c for c in b["commitments"] if c["label"] == "Eating out")["due_day"] == 0


def test_patch_touches_only_the_fields_sent(client):
    cid = _add(client, "Internet", 1699, "needs", due_day=10).json()["budget"]["commitments"][0]["id"]

    # Flipping `active` must leave the amount, bucket and due day exactly as they were.
    c = client.patch(f"/budget/commitments/{cid}?day={DAY}", json={"active": False}).json()["budget"]["commitments"][0]
    assert c["active"] is False
    assert c["amount"] == 1699 and c["bucket"] == "needs" and c["due_day"] == 10 and c["label"] == "Internet"

    c = client.patch(f"/budget/commitments/{cid}?day={DAY}", json={"amount": 1899}).json()["budget"]["commitments"][0]
    assert c["amount"] == 1899 and c["active"] is False  # still off — untouched


def test_remove_and_missing_commitment(client):
    cid = _add(client, "Gym", 1200, "wants").json()["budget"]["commitments"][0]["id"]
    assert client.delete(f"/budget/commitments/{cid}?day={DAY}").json()["budget"]["commitments"] == []

    # Patching something gone is a 404; deleting it again is harmless.
    assert client.patch(f"/budget/commitments/{cid}", json={"amount": 5}).status_code == 404
    assert client.delete(f"/budget/commitments/{cid}").status_code == 200


def test_paying_a_commitment_writes_the_money_entry(client):
    """The point of the link: a bill is never typed twice."""
    cid = _add(client, "Rent", 12000, "needs", due_day=5).json()["budget"]["commitments"][0]["id"]
    assert _budget(client)["commitments"][0]["paid_this_month"] is False

    body = client.post(f"/budget/commitments/{cid}/pay?day={DAY}").json()
    # It landed in the money log, tagged and linked — without the user retyping it.
    entry = body["money"]
    assert entry["today_out"] == 12000 and entry["balance"] == -12000
    hist = client.get(f"/money/history?scope=month&day={DAY}").json()["entries"]
    assert len(hist) == 1
    assert hist[0]["note"] == "Rent" and hist[0]["bucket"] == "needs" and hist[0]["commitment_id"] == cid
    # And it's off the due list, with the spend counted against needs.
    assert body["budget"]["commitments"][0]["paid_this_month"] is True
    assert body["budget"]["actual"] == {"income": 0, "needs": 12000, "wants": 0, "untagged": 0}


def test_a_commitment_cannot_be_paid_twice_in_one_month(client):
    cid = _add(client, "Rent", 12000, "needs", due_day=5).json()["budget"]["commitments"][0]["id"]
    assert client.post(f"/budget/commitments/{cid}/pay?day={DAY}").status_code == 200
    # Double-counting rent against needs would quietly corrupt the whole reading.
    assert client.post(f"/budget/commitments/{cid}/pay?day=2026-08-28").status_code == 409

    # A new month is a fresh obligation, so it's payable again.
    assert client.post(f"/budget/commitments/{cid}/pay?day=2026-09-05").status_code == 200
    sept = client.get("/state?day=2026-09-05").json()["budget"]
    assert sept["commitments"][0]["paid_this_month"] is True
    assert sept["actual"]["needs"] == 12000  # September's own total, not August's


def test_variable_allowance_pays_the_real_amount(client):
    cid = _add(client, "Groceries", 6000, "needs", variable=True).json()["budget"]["commitments"][0]["id"]
    b = client.post(f"/budget/commitments/{cid}/pay?day={DAY}", json={"amount": 5480.25}).json()
    assert b["budget"]["actual"]["needs"] == 5480.25  # the real spend, not the plan
    assert b["money"]["balance"] == -5480.25


def test_inactive_and_missing_commitments_are_not_payable(client):
    cid = _add(client, "Gym", 1200, "wants").json()["budget"]["commitments"][0]["id"]
    client.patch(f"/budget/commitments/{cid}?day={DAY}", json={"active": False})
    assert client.post(f"/budget/commitments/{cid}/pay?day={DAY}").status_code == 409
    assert client.post("/budget/commitments/nope/pay").status_code == 409


def test_ad_hoc_spending_can_be_tagged_and_income_never_is(client):
    client.post(f"/money?day={DAY}", json={"amount": 620, "direction": "out", "note": "milk tea", "bucket": "wants"})
    client.post(f"/money?day={DAY}", json={"amount": 300, "direction": "out", "note": "jeep"})  # untagged
    # Income isn't divided into buckets — it's what the division is *of*, so a bucket
    # sent with money in is dropped rather than silently counted as spending.
    client.post(f"/money?day={DAY}", json={"amount": 45000, "direction": "in", "bucket": "needs"})

    b = client.get(f"/state?day={DAY}").json()["budget"]
    assert b["actual"] == {"income": 45000, "needs": 0, "wants": 620, "untagged": 300}
    entries = {e["note"]: e["bucket"] for e in client.get(f"/money/history?scope=month&day={DAY}").json()["entries"]}
    assert entries == {"milk tea": "wants", "jeep": None, "": None}


def test_actuals_are_scoped_to_the_month(client):
    cid = _add(client, "Rent", 12000, "needs", due_day=5).json()["budget"]["commitments"][0]["id"]
    client.post(f"/budget/commitments/{cid}/pay?day=2026-07-05")  # last month
    assert client.get(f"/state?day={DAY}").json()["budget"]["actual"]["needs"] == 0
    assert client.get("/state?day=2026-07-20").json()["budget"]["actual"]["needs"] == 12000


def test_budget_rejects_bad_input(client):
    assert _add(client, "Rent", 0, "needs").status_code == 422           # amount must be positive
    assert _add(client, "", 500, "needs").status_code == 422             # label required
    assert _add(client, "Rent", 500, "savings").status_code == 422       # savings is the remainder
    assert _add(client, "Rent", 500, "needs", due_day=32).status_code == 422
    assert client.put("/budget/income", json={"monthly_income": -1}).status_code == 422
