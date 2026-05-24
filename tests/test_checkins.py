"""
Tests for /api/checkins.

Key invariants:
- POST is an upsert: posting same date twice updates, does not create a duplicate
- Auto-checkin is blocked for owner=Gemeinsam
- Auto-checkin calculates invested from non-cash positions only
- GET/DELETE return 404 for missing dates
"""
import pytest


CHECKIN = {"date": "2026-05-01", "invested": 12000.0, "cash": 5000.0}


# ── Basic CRUD ────────────────────────────────────────────────────────────────

def test_create_and_list(client):
    r = client.post("/api/checkins?owner=Paul", json=CHECKIN)
    assert r.status_code == 200

    data = client.get("/api/checkins?owner=Paul").json()
    dates = [c["date"] for c in data]
    assert "2026-05-01" in dates


def test_get_single_checkin(client):
    client.post("/api/checkins?owner=Paul", json=CHECKIN)
    r = client.get("/api/checkins/2026-05-01?owner=Paul")
    assert r.status_code == 200
    assert r.json()["invested"] == 12000.0


def test_get_missing_returns_404(client):
    r = client.get("/api/checkins/1999-01-01?owner=Paul")
    assert r.status_code == 404


def test_delete_removes_checkin(client):
    client.post("/api/checkins?owner=Paul", json=CHECKIN)
    r = client.delete("/api/checkins/2026-05-01?owner=Paul")
    assert r.status_code == 200

    r2 = client.get("/api/checkins/2026-05-01?owner=Paul")
    assert r2.status_code == 404


def test_delete_missing_returns_404(client):
    r = client.delete("/api/checkins/1999-01-01?owner=Paul")
    assert r.status_code == 404


# ── Upsert behavior ───────────────────────────────────────────────────────────

def test_upsert_updates_not_duplicates(client):
    client.post("/api/checkins?owner=Paul", json=CHECKIN)
    client.post("/api/checkins?owner=Paul", json={**CHECKIN, "invested": 15000.0})

    data = client.get("/api/checkins?owner=Paul").json()
    matching = [c for c in data if c["date"] == "2026-05-01"]
    assert len(matching) == 1
    assert matching[0]["invested"] == 15000.0


# ── Auto-checkin ──────────────────────────────────────────────────────────────

def test_auto_checkin_blocked_for_gemeinsam(client):
    r = client.post("/api/checkins/auto?owner=Gemeinsam")
    assert r.status_code == 400


def test_auto_checkin_returns_invested_and_date(client, db_conn):
    db_conn.execute(
        "INSERT INTO positions (name, ticker, isin, units, avg_buy_price, asset_class, owner) "
        "VALUES ('Test ETF', 'XDWT.DE', 'IE00BM67HT60', 10, 100, 'etf', 'Paul')"
    )
    db_conn.commit()
    pos_id = db_conn.execute(
        "SELECT id FROM positions WHERE owner='Paul' AND asset_class='etf' LIMIT 1"
    ).fetchone()["id"]

    r = client.post("/api/checkins/auto?owner=Paul")
    assert r.status_code == 200
    body = r.json()
    assert "date" in body
    assert "invested" in body
    assert body["invested"] >= 0


def test_auto_checkin_excludes_cash_positions(client, db_conn):
    # Add a cash position with high value — should NOT be in invested
    db_conn.execute(
        "INSERT INTO positions (name, ticker, units, avg_buy_price, asset_class, owner) "
        "VALUES ('My Cash', NULL, 1, 50000, 'cash', 'Paul')"
    )
    # Zero out all ETF/other positions so invested = 0
    db_conn.execute(
        "UPDATE positions SET units=0 WHERE owner='Paul' AND asset_class != 'cash'"
    )
    db_conn.commit()

    r = client.post("/api/checkins/auto?owner=Paul")
    body = r.json()
    assert body["invested"] == pytest.approx(0.0)
