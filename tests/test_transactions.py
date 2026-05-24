"""
Tests for /api/transactions.

Key invariants:
- Gemeinsam owner is blocked for create and delete
- Sell transactions always stored with negative units regardless of input sign
- position_id filter returns only matching transactions
- CSV import stores broker cash when EUR amount column is present
"""
import io
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


# ── Gemeinsam guard ───────────────────────────────────────────────────────────

def test_create_blocked_for_gemeinsam(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    r = client.post("/api/transactions?owner=Gemeinsam", json={
        "position_id": pos_id, "date": "2026-05-01",
        "units": 10, "price": 100.0, "type": "buy",
    })
    assert r.status_code == 400


def test_delete_blocked_for_gemeinsam(client):
    r = client.delete("/api/transactions/1?owner=Gemeinsam")
    assert r.status_code == 400


# ── Sign enforcement ──────────────────────────────────────────────────────────

def test_sell_units_stored_negative(client, db_conn):
    pos_id = _paul_etf_id(db_conn)
    # Buy first so position has units to sell
    client.post("/api/transactions?owner=Paul", json={
        "position_id": pos_id, "date": "2026-01-01",
        "units": 10, "price": 100.0, "type": "buy",
    })
    # Submit sell with positive units — router must negate them
    client.post("/api/transactions?owner=Paul", json={
        "position_id": pos_id, "date": "2026-05-01",
        "units": 5, "price": 120.0, "type": "sell",
    })
    txns = client.get(f"/api/transactions?owner=Paul&position_id={pos_id}").json()
    sells = [t for t in txns if t["type"] == "sell"]
    assert len(sells) == 1
    assert sells[0]["units"] < 0


# ── Filtering ─────────────────────────────────────────────────────────────────

def test_filter_by_position_id(client, db_conn):
    for name, isin in [("ETF Alpha", "IE00TEST0001"), ("ETF Beta", "IE00TEST0002")]:
        db_conn.execute(
            "INSERT INTO positions (name, ticker, isin, units, avg_buy_price, asset_class, owner) "
            f"VALUES ('{name}', 'TEST.DE', '{isin}', 0, 0, 'etf', 'Paul')"
        )
    db_conn.commit()
    rows = db_conn.execute(
        "SELECT id FROM positions WHERE owner='Paul' AND asset_class='etf'"
    ).fetchmany(2)
    pos_a, pos_b = rows[0]["id"], rows[1]["id"]
    client.post("/api/transactions?owner=Paul", json={
        "position_id": pos_a, "date": "2026-05-01",
        "units": 5, "price": 100.0, "type": "buy",
    })
    client.post("/api/transactions?owner=Paul", json={
        "position_id": pos_b, "date": "2026-05-01",
        "units": 3, "price": 200.0, "type": "buy",
    })

    result = client.get(f"/api/transactions?owner=Paul&position_id={pos_a}").json()
    assert all(t["position_id"] == pos_a for t in result)


# ── Owner isolation ───────────────────────────────────────────────────────────

def test_list_excludes_other_owners(client, db_conn):
    db_conn.execute(
        "INSERT INTO positions (name, ticker, units, avg_buy_price, asset_class, owner) "
        "VALUES ('Lena ETF', 'X.DE', 0, 0, 'etf', 'Lena')"
    )
    db_conn.commit()
    lena_id = db_conn.execute(
        "SELECT id FROM positions WHERE owner='Lena' LIMIT 1"
    ).fetchone()["id"]

    client.post("/api/transactions?owner=Lena", json={
        "position_id": lena_id, "date": "2026-05-01",
        "units": 10, "price": 50.0, "type": "buy",
    })

    paul_txns = client.get("/api/transactions?owner=Paul").json()
    assert all(t["owner"] == "Paul" for t in paul_txns)


# ── CSV import ────────────────────────────────────────────────────────────────

# Minimal Trade Republic CSV (old format: typ + isin cols → auto-detected as trade_republic).
# ISIN IE00BM67HT60 matches "Xtrackers MSCI World Info Tech" in default positions.
_TR_CSV = """\
typ,datum,isin,name,stück,kurs,gesamtbetrag
Einlage,2026-01-01,,,,,2000.00
Kauf,2026-01-10,IE00BM67HT60,MSCI World Info Tech,10,100.00,-1000.00
Verkauf,2026-02-01,IE00BM67HT60,MSCI World Info Tech,5,120.00,600.00
""".encode()


def test_csv_import_returns_imported_count(client):
    r = client.post(
        "/api/transactions/import?owner=Paul",
        files={"file": ("tr_export.csv", io.BytesIO(_TR_CSV), "text/csv")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["imported"] == 2   # deposit row is skipped (no units/price), buy + sell imported
    assert data["errors"] == []


def test_csv_import_stores_broker_cash(client, db_conn):
    client.post(
        "/api/transactions/import?owner=Paul",
        files={"file": ("tr_export.csv", io.BytesIO(_TR_CSV), "text/csv")},
    )
    row = db_conn.execute(
        "SELECT balance FROM broker_cash WHERE owner='Paul' AND broker='Trade Republic'"
    ).fetchone()
    assert row is not None
    # 2000 deposit − 1000 buy + 600 sell = 1600
    assert row["balance"] == pytest.approx(1600.0, abs=0.01)


def test_csv_import_broker_cash_reflected_in_summary(client, db_conn):
    client.post(
        "/api/transactions/import?owner=Paul",
        files={"file": ("tr_export.csv", io.BytesIO(_TR_CSV), "text/csv")},
    )
    summary = client.get("/api/portfolio/summary?owner=Paul").json()
    assert summary["cash_value"] == pytest.approx(1600.0, abs=0.01)


def test_csv_import_blocked_for_gemeinsam(client):
    r = client.post(
        "/api/transactions/import?owner=Gemeinsam",
        files={"file": ("tr_export.csv", io.BytesIO(_TR_CSV), "text/csv")},
    )
    assert r.status_code == 400
