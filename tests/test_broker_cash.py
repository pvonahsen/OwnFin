"""
Tests for GET /api/portfolio/broker_cash.

Key invariants:
- Empty DB returns {entries: [], total: 0}
- After inserting a broker_cash row, the entry appears and total matches
- Multiple entries for the same owner sum correctly
- Gemeinsam aggregates both Paul's and Lena's broker cash
- total equals the sum of all entry balances
"""
import pytest


# ── Empty state ───────────────────────────────────────────────────────────────

def test_broker_cash_empty_returns_zero(client):
    r = client.get("/api/portfolio/broker_cash?owner=Paul")
    assert r.status_code == 200
    data = r.json()
    assert data["entries"] == []
    assert data["total"] == 0


# ── Single entry ──────────────────────────────────────────────────────────────

def test_broker_cash_single_entry(client, db_conn):
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance, last_import) VALUES (?, ?, ?, ?)",
        ("Paul", "TradeRepublic", 1234.56, "2026-05-20"),
    )
    db_conn.commit()

    r = client.get("/api/portfolio/broker_cash?owner=Paul")
    data = r.json()
    assert len(data["entries"]) == 1
    assert data["entries"][0]["broker"] == "TradeRepublic"
    assert data["entries"][0]["balance"] == pytest.approx(1234.56)
    assert data["total"] == pytest.approx(1234.56)


# ── Total equals sum of entries ───────────────────────────────────────────────

def test_broker_cash_total_matches_sum_of_entries(client, db_conn):
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Paul", "TradeRepublic", 1000.0),
    )
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Paul", "Flatex", 500.50),
    )
    db_conn.commit()

    r = client.get("/api/portfolio/broker_cash?owner=Paul")
    data = r.json()
    entry_sum = sum(e["balance"] for e in data["entries"])
    assert data["total"] == pytest.approx(entry_sum)
    assert data["total"] == pytest.approx(1500.50)


# ── Owner isolation ───────────────────────────────────────────────────────────

def test_broker_cash_owner_isolation(client, db_conn):
    """Lena's cash must not appear in Paul's response."""
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Lena", "TradeRepublic", 9000.0),
    )
    db_conn.commit()

    r = client.get("/api/portfolio/broker_cash?owner=Paul")
    data = r.json()
    assert data["entries"] == []
    assert data["total"] == 0


# ── Gemeinsam aggregates ──────────────────────────────────────────────────────

def test_broker_cash_gemeinsam_aggregates_both_owners(client, db_conn):
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Paul", "TradeRepublic", 2000.0),
    )
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Lena", "TradeRepublic", 1500.0),
    )
    db_conn.commit()

    r = client.get("/api/portfolio/broker_cash?owner=Gemeinsam")
    data = r.json()
    assert data["total"] == pytest.approx(3500.0)
    # Gemeinsam groups by broker — there should be 1 entry (both use TradeRepublic)
    assert len(data["entries"]) == 1
    assert data["entries"][0]["balance"] == pytest.approx(3500.0)


def test_broker_cash_gemeinsam_different_brokers(client, db_conn):
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Paul", "TradeRepublic", 1000.0),
    )
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Lena", "Flatex", 800.0),
    )
    db_conn.commit()

    r = client.get("/api/portfolio/broker_cash?owner=Gemeinsam")
    data = r.json()
    assert data["total"] == pytest.approx(1800.0)
    assert len(data["entries"]) == 2


# ── Summary cash_value reflects broker_cash ───────────────────────────────────

def test_summary_cash_value_uses_broker_cash(client, db_conn):
    """portfolio/summary cash_value should reflect broker_cash total when present."""
    db_conn.execute(
        "INSERT INTO broker_cash (owner, broker, balance) VALUES (?, ?, ?)",
        ("Paul", "TradeRepublic", 3333.0),
    )
    db_conn.commit()

    data = client.get("/api/portfolio/summary?owner=Paul").json()
    assert data["cash_value"] == pytest.approx(3333.0)
