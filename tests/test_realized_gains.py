"""
Tests for /api/realized-gains/summary, /by-year, /transactions.

Key invariants pinned here:
- KeSt rate is 27.5% (Austria) applied only to gains, not losses
- Dividends are excluded from gain calculations
- sale_price is auto-captured from avg_buy_price at time of sell
- Losses offset net_gain but generate no KeSt
"""
import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _etf_pos_id(db_conn):
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


def _buy(client, pos_id, units, price, owner="Paul", date="2026-01-15"):
    r = client.post(f"/api/transactions?owner={owner}", json={
        "position_id": pos_id, "date": date,
        "units": units, "price": price, "type": "buy",
    })
    assert r.status_code == 200


def _sell(client, pos_id, units, price, owner="Paul", date="2026-05-01"):
    r = client.post(f"/api/transactions?owner={owner}", json={
        "position_id": pos_id, "date": date,
        "units": units, "price": price, "type": "sell",
    })
    assert r.status_code == 200


# ── /api/realized-gains/summary ──────────────────────────────────────────────

def test_summary_no_sells_returns_zeros(client):
    data = client.get("/api/realized-gains/summary?owner=Paul").json()
    assert data["total_gains"] == 0.0
    assert data["total_losses"] == 0.0
    assert data["kest_amount"] == 0.0


def test_summary_gain_and_kest_calculation(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 10, 100.0)
    _sell(client, pos_id, 10, 150.0)  # gain = (150-100)*10 = 500

    data = client.get("/api/realized-gains/summary?owner=Paul").json()
    assert data["total_gains"] == pytest.approx(500.0)
    assert data["kest_rate_pct"] == pytest.approx(27.5)
    assert data["kest_amount"] == pytest.approx(137.5)   # 500 * 0.275
    assert data["net_after_kest"] == pytest.approx(362.5)


def test_summary_loss_not_taxed(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 10, 100.0)
    _sell(client, pos_id, 10, 80.0)   # loss = 200

    data = client.get("/api/realized-gains/summary?owner=Paul").json()
    assert data["total_losses"] == pytest.approx(200.0)
    assert data["total_gains"] == 0.0
    assert data["kest_amount"] == 0.0
    assert data["net_gain"] == pytest.approx(-200.0)


def test_summary_gain_and_loss_combined(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 20, 100.0)
    _sell(client, pos_id, 10, 150.0, date="2026-04-01")  # +500
    _sell(client, pos_id, 10, 80.0,  date="2026-05-01")  # -200

    data = client.get("/api/realized-gains/summary?owner=Paul").json()
    assert data["total_gains"] == pytest.approx(500.0)
    assert data["total_losses"] == pytest.approx(200.0)
    assert data["net_gain"] == pytest.approx(300.0)
    # KeSt only on gains, not netted against losses
    assert data["kest_amount"] == pytest.approx(137.5)


def test_summary_dividends_excluded(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    client.post("/api/transactions?owner=Paul", json={
        "position_id": pos_id, "date": "2026-03-01",
        "units": 0, "price": 200.0, "type": "dividend",
    })
    data = client.get("/api/realized-gains/summary?owner=Paul").json()
    assert data["total_gains"] == 0.0
    assert data["kest_amount"] == 0.0


def test_summary_owner_isolation(client, db_conn):
    db_conn.execute(
        "INSERT INTO positions (name, ticker, units, avg_buy_price, asset_class, owner) "
        "VALUES ('Lena ETF', 'X.DE', 0, 0, 'etf', 'Lena')"
    )
    db_conn.commit()
    lena_id = db_conn.execute(
        "SELECT id FROM positions WHERE owner='Lena' LIMIT 1"
    ).fetchone()["id"]

    _buy(client, lena_id, 10, 100.0, owner="Lena")
    _sell(client, lena_id, 10, 200.0, owner="Lena")  # 1000€ gain for Lena

    paul = client.get("/api/realized-gains/summary?owner=Paul").json()
    assert paul["total_gains"] == 0.0


# ── /api/realized-gains/by-year ──────────────────────────────────────────────

def test_by_year_groups_and_calculates_kest(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 20, 100.0, date="2025-01-01")
    _sell(client, pos_id, 10, 150.0, date="2025-06-01")   # 500 gain in 2025
    _sell(client, pos_id, 10, 160.0, date="2026-01-15")   # 600 gain in 2026

    data = client.get("/api/realized-gains/by-year?owner=Paul").json()
    by_year = {r["year"]: r for r in data}

    assert "2025" in by_year and "2026" in by_year
    assert by_year["2025"]["gains"] == pytest.approx(500.0)
    assert by_year["2025"]["kest"] == pytest.approx(137.5)
    assert by_year["2026"]["gains"] == pytest.approx(600.0)


def test_by_year_returned_newest_first(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 20, 100.0, date="2024-01-01")
    _sell(client, pos_id, 10, 120.0, date="2024-06-01")
    _sell(client, pos_id, 10, 130.0, date="2026-01-01")

    data = client.get("/api/realized-gains/by-year?owner=Paul").json()
    years = [r["year"] for r in data]
    assert years == sorted(years, reverse=True)


# ── /api/realized-gains/transactions ─────────────────────────────────────────

def test_transactions_sorted_newest_first(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 20, 100.0, date="2025-01-01")
    _sell(client, pos_id, 5, 120.0, date="2025-03-01")
    _sell(client, pos_id, 5, 130.0, date="2026-02-01")

    data = client.get("/api/realized-gains/transactions?owner=Paul").json()
    dates = [r["date"] for r in data]
    assert dates == sorted(dates, reverse=True)


def test_transactions_includes_gain_fields(client, db_conn):
    pos_id = _etf_pos_id(db_conn)
    _buy(client, pos_id, 10, 100.0)
    _sell(client, pos_id, 10, 150.0)

    data = client.get("/api/realized-gains/transactions?owner=Paul").json()
    assert len(data) == 1
    row = data[0]
    assert row["total_gain"] == pytest.approx(500.0)
    assert row["kest"] == pytest.approx(137.5)
    assert row["cost_per_unit"] == pytest.approx(100.0)
    assert row["sell_price"] == pytest.approx(150.0)
