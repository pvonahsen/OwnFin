"""
Tests for /api/sparplans.

Key invariants:
- Response shape is {sparplans: [...], monthly_total: N} — NOT a bare array
- Creating with invalid position_id returns 404
- Execute calculates units = monthly_amount / price unless units explicitly provided
- Delete deactivates (soft delete); deactivated plans vanish from list
"""
import pytest


def _paul_etf_id(db_conn):
    row = db_conn.execute(
        "SELECT id FROM positions WHERE owner='Paul' AND asset_class='etf' LIMIT 1"
    ).fetchone()
    if row:
        return row["id"]
    db_conn.execute(
        "INSERT INTO positions (name, ticker, isin, units, avg_buy_price, asset_class, owner) "
        "VALUES ('Test ETF', 'XDWT.DE', 'IE00BM67HT60', 0, 0, 'etf', 'Paul')"
    )
    db_conn.commit()
    return db_conn.execute(
        "SELECT id FROM positions WHERE owner='Paul' AND asset_class='etf' LIMIT 1"
    ).fetchone()["id"]


def _create(client, pos_id, monthly=200.0, owner="Paul"):
    return client.post(f"/api/sparplans?owner={owner}", json={
        "position_id": pos_id,
        "monthly_amount": monthly,
        "execution_day": 1,
    })


# ── Response shape ────────────────────────────────────────────────────────────

def test_list_returns_envelope_not_bare_array(client):
    data = client.get("/api/sparplans?owner=Paul").json()
    assert "sparplans" in data
    assert "monthly_total" in data
    assert isinstance(data["sparplans"], list)


def test_list_empty_owner_has_zero_total(client):
    data = client.get("/api/sparplans?owner=Lena").json()
    assert data["sparplans"] == []
    assert data["monthly_total"] == 0.0


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_invalid_position_returns_404(client):
    r = client.post("/api/sparplans?owner=Paul", json={
        "position_id": 999999,
        "monthly_amount": 100.0,
        "execution_day": 1,
    })
    assert r.status_code == 404


def test_create_and_appears_in_list(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    r = _create(client, pos_id, monthly=300.0)
    assert r.status_code == 200
    assert "id" in r.json()

    data = client.get("/api/sparplans?owner=Paul").json()
    assert len(data["sparplans"]) == 1
    assert data["sparplans"][0]["monthly_amount"] == 300.0
    assert data["monthly_total"] == 300.0


def test_monthly_total_sums_all_active(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    _create(client, pos_id, monthly=200.0)
    _create(client, pos_id, monthly=150.0)

    data = client.get("/api/sparplans?owner=Paul").json()
    assert data["monthly_total"] == pytest.approx(350.0)


# ── Execute ───────────────────────────────────────────────────────────────────

def test_execute_calculates_units_from_monthly_amount(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    sp_id = _create(client, pos_id, monthly=200.0).json()["id"]

    r = client.post(f"/api/sparplans/{sp_id}/execute?owner=Paul", json={
        "date": "2026-05-01",
        "price": 50.0,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["units"] == pytest.approx(4.0)   # 200 / 50
    assert body["invested"] == pytest.approx(200.0)


def test_execute_uses_explicit_units_when_provided(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    sp_id = _create(client, pos_id, monthly=200.0).json()["id"]

    r = client.post(f"/api/sparplans/{sp_id}/execute?owner=Paul", json={
        "date": "2026-05-01",
        "price": 50.0,
        "units": 3.5,
    })
    assert r.json()["units"] == pytest.approx(3.5)


def test_execute_zero_price_returns_400(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    sp_id = _create(client, pos_id, monthly=200.0).json()["id"]

    r = client.post(f"/api/sparplans/{sp_id}/execute?owner=Paul", json={
        "date": "2026-05-01",
        "price": 0.0,
    })
    assert r.status_code == 400


def test_execute_nonexistent_sparplan_returns_404(client):
    r = client.post("/api/sparplans/999999/execute?owner=Paul", json={
        "date": "2026-05-01",
        "price": 50.0,
    })
    assert r.status_code == 404


# ── Delete ────────────────────────────────────────────────────────────────────

def test_delete_removes_from_active_list(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    sp_id = _create(client, pos_id, monthly=200.0).json()["id"]

    r = client.delete(f"/api/sparplans/{sp_id}")
    assert r.status_code == 200

    data = client.get("/api/sparplans?owner=Paul").json()
    ids = [s["id"] for s in data["sparplans"]]
    assert sp_id not in ids
    assert data["monthly_total"] == 0.0


def test_delete_nonexistent_returns_404(client):
    r = client.delete("/api/sparplans/999999")
    assert r.status_code == 404
