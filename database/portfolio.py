import sqlite3
from typing import Optional


# ── Positions ─────────────────────────────────────────────────────────────────

def get_positions(conn: sqlite3.Connection, active_only: bool = True, owner: Optional[str] = None) -> list:
    conditions = []
    params: list = []
    if active_only:
        conditions.append("is_active=1")
    if owner and owner != "Gemeinsam":
        conditions.append("owner=?")
        params.append(owner)
    q = "SELECT * FROM positions"
    if conditions:
        q += " WHERE " + " AND ".join(conditions)
    q += " ORDER BY owner, id"
    return [dict(r) for r in conn.execute(q, params).fetchall()]


def get_position(conn: sqlite3.Connection, pos_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM positions WHERE id=?", (pos_id,)).fetchone()
    return dict(row) if row else None


def create_position(conn: sqlite3.Connection, data: dict, owner: str) -> int:
    d = {**data, "owner": owner}
    cur = conn.execute(
        """INSERT INTO positions
           (name, ticker, isin, units, avg_buy_price, monthly_rate, target_weight, asset_class, notes, owner)
           VALUES (:name, :ticker, :isin, :units, :avg_buy_price, :monthly_rate, :target_weight, :asset_class, :notes, :owner)""",
        d,
    )
    conn.commit()
    return cur.lastrowid


def update_position(conn: sqlite3.Connection, pos_id: int, data: dict) -> None:
    fields = ", ".join(f"{k}=:{k}" for k in data)
    data["_id"] = pos_id
    conn.execute(f"UPDATE positions SET {fields} WHERE id=:_id", data)
    conn.commit()


def deactivate_position(conn: sqlite3.Connection, pos_id: int) -> None:
    conn.execute("UPDATE positions SET is_active=0 WHERE id=?", (pos_id,))
    conn.commit()


def update_position_sync_error(conn: sqlite3.Connection, pos_id: int, error) -> None:
    """Set or clear the last_sync_error for a position. Pass None to clear."""
    conn.execute("UPDATE positions SET last_sync_error=? WHERE id=?", (error, pos_id))


# ── Prices ────────────────────────────────────────────────────────────────────

def upsert_price(conn: sqlite3.Connection, position_id: int, date: str, price: float, currency: str = "EUR") -> None:
    conn.execute(
        """INSERT INTO prices (position_id, date, price, currency) VALUES (?, ?, ?, ?)
           ON CONFLICT(position_id, date) DO UPDATE SET price=excluded.price""",
        (position_id, date, price, currency),
    )


def get_latest_prices(conn: sqlite3.Connection) -> dict:
    rows = conn.execute("""
        SELECT p.position_id, p.price, p.date, p.currency
        FROM prices p
        INNER JOIN (
            SELECT position_id, MAX(date) AS max_date FROM prices GROUP BY position_id
        ) latest ON p.position_id=latest.position_id AND p.date=latest.max_date
    """).fetchall()
    return {r["position_id"]: dict(r) for r in rows}


def get_price_history(conn: sqlite3.Connection, position_id: int) -> list:
    rows = conn.execute(
        "SELECT date, price FROM prices WHERE position_id=? ORDER BY date",
        (position_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_last_sync(conn: sqlite3.Connection) -> Optional[str]:
    row = conn.execute("SELECT value FROM settings WHERE key='last_sync'").fetchone()
    return row["value"] if row else None


def save_last_sync(conn: sqlite3.Connection, timestamp: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?)",
        (timestamp,),
    )
    conn.commit()


# ── Dividenden ────────────────────────────────────────────────────────────────

def get_dividends(conn: sqlite3.Connection, position_id: Optional[int] = None, owner: Optional[str] = None) -> list:
    if position_id is not None:
        rows = conn.execute(
            "SELECT * FROM dividends WHERE position_id=? ORDER BY date DESC", (position_id,)
        ).fetchall()
    elif owner and owner != "Gemeinsam":
        rows = conn.execute(
            """SELECT d.*, p.name AS position_name FROM dividends d
               JOIN positions p ON d.position_id=p.id
               WHERE p.owner=? ORDER BY d.date DESC""",
            (owner,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT d.*, p.name AS position_name FROM dividends d
               JOIN positions p ON d.position_id=p.id ORDER BY d.date DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


def upsert_dividend(conn: sqlite3.Connection, position_id: int, date: str, amount_per_unit: float, units: float) -> None:
    conn.execute(
        """INSERT INTO dividends (position_id, date, amount_per_unit, total_amount) VALUES (?, ?, ?, ?)
           ON CONFLICT(position_id, date) DO UPDATE SET
               amount_per_unit=excluded.amount_per_unit, total_amount=excluded.total_amount""",
        (position_id, date, amount_per_unit, round(amount_per_unit * units, 4)),
    )
    conn.commit()


def delete_dividend(conn: sqlite3.Connection, div_id: int) -> None:
    conn.execute("DELETE FROM dividends WHERE id=?", (div_id,))
    conn.commit()


# ── Sparpläne ────────────────────────────────────────────────────────────────

def get_sparplans(conn: sqlite3.Connection, active_only: bool = True, owner: Optional[str] = None) -> list:
    conditions = []
    params: list = []
    if active_only:
        conditions.append("s.is_active=1")
    if owner and owner != "Gemeinsam":
        conditions.append("s.owner=?")
        params.append(owner)
    q = """SELECT s.*, p.name AS position_name, p.ticker
           FROM sparplans s JOIN positions p ON s.position_id=p.id"""
    if conditions:
        q += " WHERE " + " AND ".join(conditions)
    q += " ORDER BY s.id"
    return [dict(r) for r in conn.execute(q, params).fetchall()]


def get_sparplan(conn: sqlite3.Connection, sp_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM sparplans WHERE id=?", (sp_id,)).fetchone()
    return dict(row) if row else None


def create_sparplan(conn: sqlite3.Connection, data: dict, owner: str) -> int:
    d = {**data, "owner": owner}
    cur = conn.execute(
        """INSERT INTO sparplans (position_id, monthly_amount, execution_day, started_at, notes, owner)
           VALUES (:position_id, :monthly_amount, :execution_day, :started_at, :notes, :owner)""",
        d,
    )
    conn.commit()
    return cur.lastrowid


def update_sparplan(conn: sqlite3.Connection, sp_id: int, data: dict) -> None:
    fields = ", ".join(f"{k}=:{k}" for k in data)
    data["_id"] = sp_id
    conn.execute(f"UPDATE sparplans SET {fields} WHERE id=:_id", data)
    conn.commit()


def deactivate_sparplan(conn: sqlite3.Connection, sp_id: int) -> None:
    conn.execute("UPDATE sparplans SET is_active=0 WHERE id=?", (sp_id,))
    conn.commit()


# ── Baselines ─────────────────────────────────────────────────────────────────

import json as _json


def save_baseline(
    conn: sqlite3.Connection,
    owner: str,
    ref_month: str,
    start_value: float,
    projection_json: str,
) -> None:
    conn.execute(
        """INSERT OR REPLACE INTO baselines (owner, ref_month, start_value, projection_json, fixed_at)
           VALUES (?, ?, ?, ?, datetime('now'))""",
        (owner, ref_month, start_value, projection_json),
    )
    conn.commit()


def get_baseline(conn: sqlite3.Connection, owner: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM baselines WHERE owner=?", (owner,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["projection"] = _json.loads(d["projection_json"])
    del d["projection_json"]
    return d


# ── Imports ───────────────────────────────────────────────────────────────────

def log_import(conn: sqlite3.Connection, source: str, rows_processed: int, month_created: Optional[str] = None) -> None:
    conn.execute(
        "INSERT INTO imports (source, rows_processed, month_created) VALUES (?, ?, ?)",
        (source, rows_processed, month_created),
    )
    conn.commit()


def get_import_history(conn: sqlite3.Connection) -> list:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM imports ORDER BY imported_at DESC LIMIT 50"
    ).fetchall()]


# ── Transaktionen ─────────────────────────────────────────────────────────────

def _recalc_position_from_txns(conn: sqlite3.Connection, position_id: int) -> None:
    """Recalculates units and avg_buy_price for a position from its transactions.
    Positions fully sold out (net_units < 0.0001) are auto-deactivated."""
    txns = conn.execute(
        "SELECT units, price FROM transactions WHERE position_id=? ORDER BY date",
        (position_id,),
    ).fetchall()
    if not txns:
        return
    net_units = round(sum(t["units"] for t in txns), 8)
    buys = [t for t in txns if t["units"] > 0]
    total_buy_units = sum(t["units"] for t in buys)
    total_buy_cost  = sum(t["units"] * t["price"] for t in buys)
    avg_price = round(total_buy_cost / total_buy_units, 6) if total_buy_units > 0 else 0
    if net_units < 0.0001:
        conn.execute(
            "UPDATE positions SET units=0, avg_buy_price=?, is_active=0 WHERE id=?",
            (avg_price, position_id),
        )
    else:
        conn.execute(
            "UPDATE positions SET units=?, avg_buy_price=?, is_active=1 WHERE id=?",
            (net_units, avg_price, position_id),
        )
    conn.commit()


def get_transactions(
    conn: sqlite3.Connection,
    owner: Optional[str] = None,
    position_id: Optional[int] = None,
) -> list:
    conditions, params = [], []
    if owner and owner != "Gemeinsam":
        conditions.append("t.owner=?"); params.append(owner)
    if position_id is not None:
        conditions.append("t.position_id=?"); params.append(position_id)
    q = """SELECT t.*, p.name AS position_name, p.ticker
           FROM transactions t JOIN positions p ON t.position_id=p.id"""
    if conditions:
        q += " WHERE " + " AND ".join(conditions)
    q += " ORDER BY t.date DESC, t.id DESC"
    return [dict(r) for r in conn.execute(q, params).fetchall()]


def add_transaction(
    conn: sqlite3.Connection,
    position_id: int,
    owner: str,
    date: str,
    units: float,
    price: float,
    tx_type: str = "buy",
    notes: Optional[str] = None,
    cost_basis: Optional[float] = None,
) -> int:
    # Auto-capture cost basis from current avg_buy_price when selling
    if cost_basis is None and units < 0:
        pos = conn.execute("SELECT avg_buy_price FROM positions WHERE id=?", (position_id,)).fetchone()
        if pos:
            cost_basis = pos["avg_buy_price"]
    cur = conn.execute(
        """INSERT INTO transactions (position_id, owner, date, units, price, type, notes, sale_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (position_id, owner, date, units, price, tx_type, notes, cost_basis),
    )
    conn.commit()
    _recalc_position_from_txns(conn, position_id)
    return cur.lastrowid


def transaction_exists(
    conn: sqlite3.Connection,
    position_id: int,
    date: str,
    units: float,
    price: float,
) -> bool:
    total_value = price * units
    # Look up ISIN for this position and match semantically
    isin_row = conn.execute(
        "SELECT isin FROM positions WHERE id=?", (position_id,)
    ).fetchone()
    isin = (isin_row["isin"] or "").strip() if isin_row else ""

    if isin:
        row = conn.execute(
            """SELECT t.id FROM transactions t
               JOIN positions p ON t.position_id = p.id
               WHERE p.isin = ? AND t.date = ?
               AND ABS(t.price * t.units - ?) < 0.01""",
            (isin, date, total_value),
        ).fetchone()
    else:
        # Fallback for positions without ISIN: match by position_id + date + value
        row = conn.execute(
            """SELECT id FROM transactions
               WHERE position_id=? AND date=?
               AND ABS(price * units - ?) < 0.01""",
            (position_id, date, total_value),
        ).fetchone()
    return row is not None


def delete_transaction(conn: sqlite3.Connection, tx_id: int) -> None:
    row = conn.execute("SELECT position_id FROM transactions WHERE id=?", (tx_id,)).fetchone()
    if not row:
        return
    position_id = row["position_id"]
    conn.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
    conn.commit()
    _recalc_position_from_txns(conn, position_id)
