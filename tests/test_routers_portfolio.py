"""
Integration tests for /api/portfolio/summary and /api/positions.

Uses a fresh in-memory-equivalent SQLite DB per test (see conftest.py).
Positions are created explicitly within each test — no defaults are seeded.
"""


SUMMARY_KEYS = {
    "total_value", "cash_value", "total_invested",
    "total_gain", "total_return_pct",
    "position_values", "rebalancing", "countdown", "monthly_savings",
}


def _create_paul_etf(db_conn):
    """Insert a Paul ETF position and return its id."""
    db_conn.execute(
        "INSERT INTO positions (name, ticker, isin, units, avg_buy_price, asset_class, owner) "
        "VALUES ('Test ETF', 'XDWT.DE', 'IE00BM67HT60', 0, 0, 'etf', 'Paul')"
    )
    db_conn.commit()
    return db_conn.execute(
        "SELECT id FROM positions WHERE owner='Paul' AND asset_class='etf' LIMIT 1"
    ).fetchone()["id"]


# ── /api/portfolio/summary ────────────────────────────────────────────────────

def test_summary_returns_200_with_expected_shape(client):
    r = client.get("/api/portfolio/summary?owner=Paul")
    assert r.status_code == 200
    assert SUMMARY_KEYS.issubset(r.json().keys())


def test_summary_uses_latest_price(client, db_conn):
    pos_id = _create_paul_etf(db_conn)

    db_conn.execute(
        "UPDATE positions SET units=10, avg_buy_price=100 WHERE id=?", (pos_id,)
    )
    db_conn.execute(
        "INSERT INTO prices (position_id, date, price) VALUES (?, '2026-05-15', 130.0)",
        (pos_id,),
    )
    db_conn.commit()

    data = client.get("/api/portfolio/summary?owner=Paul").json()
    assert data["position_values"][str(pos_id)] == 1300.0


def test_summary_falls_back_to_avg_buy_price_when_no_price(client, db_conn):
    pos_id = _create_paul_etf(db_conn)

    db_conn.execute(
        "UPDATE positions SET units=5, avg_buy_price=200 WHERE id=?", (pos_id,)
    )
    db_conn.commit()

    data = client.get("/api/portfolio/summary?owner=Paul").json()
    assert data["position_values"][str(pos_id)] == 1000.0


def test_summary_cash_excluded_from_total_value(client, db_conn):
    # Give Lena a cash position only — total_value must stay 0
    db_conn.execute(
        """INSERT INTO positions
           (name, ticker, units, avg_buy_price, asset_class, owner)
           VALUES ('Lena Cash', NULL, 1, 5000, 'cash', 'Lena')"""
    )
    db_conn.commit()

    data = client.get("/api/portfolio/summary?owner=Lena").json()
    assert data["total_value"] == 0.0
    assert data["cash_value"] == 0.0  # cash_value comes from broker_cash or settings.cash


def test_summary_owner_isolation(client, db_conn):
    # Give Lena a position with a known price; Paul's summary must not change
    db_conn.execute(
        """INSERT INTO positions
           (name, ticker, units, avg_buy_price, asset_class, owner)
           VALUES ('Lena ETF', 'TEST.DE', 100, 50, 'etf', 'Lena')"""
    )
    db_conn.commit()

    paul = client.get("/api/portfolio/summary?owner=Paul").json()
    lena = client.get("/api/portfolio/summary?owner=Lena").json()

    assert lena["total_value"] == 5000.0
    assert paul["total_value"] != lena["total_value"]


def test_summary_total_gain_calculation(client, db_conn):
    pos_id = _create_paul_etf(db_conn)

    db_conn.execute(
        "UPDATE positions SET units=10, avg_buy_price=100 WHERE id=?", (pos_id,)
    )
    db_conn.execute(
        "INSERT INTO prices (position_id, date, price) VALUES (?, '2026-05-15', 150.0)",
        (pos_id,),
    )
    db_conn.commit()

    data = client.get("/api/portfolio/summary?owner=Paul").json()
    # total_gain = total_value - total_invested; this position contributes 500€ gain
    assert data["total_gain"] >= 500.0


# ── /api/positions ────────────────────────────────────────────────────────────

def test_list_positions_paul_empty_by_default(client):
    r = client.get("/api/positions?owner=Paul")
    assert r.status_code == 200
    assert r.json() == []


def test_list_positions_lena_empty_by_default(client):
    r = client.get("/api/positions?owner=Lena")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_retrieve_position(client):
    r = client.post("/api/positions?owner=Lena", json={
        "name": "Test ETF",
        "ticker": "TEST.DE",
        "units": 20.0,
        "avg_buy_price": 50.0,
        "asset_class": "etf",
        "target_weight": 100,
    })
    assert r.status_code == 200

    positions = client.get("/api/positions?owner=Lena").json()
    assert len(positions) == 1
    assert positions[0]["name"] == "Test ETF"
    assert positions[0]["units"] == 20.0
