import sqlite3
from typing import Optional


# -- Broker Cash --------------------------------------------------------------

def get_broker_cash(conn: sqlite3.Connection, owner: Optional[str] = None) -> list:
    if owner == "Gemeinsam":
        rows = conn.execute(
            "SELECT broker, SUM(balance) AS balance, MAX(last_import) AS last_import "
            "FROM broker_cash GROUP BY broker"
        ).fetchall()
    elif owner:
        rows = conn.execute(
            "SELECT * FROM broker_cash WHERE owner=? ORDER BY broker", (owner,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM broker_cash ORDER BY owner, broker").fetchall()
    return [dict(r) for r in rows]


def get_broker_cash_total(conn: sqlite3.Connection, owner: Optional[str] = None) -> Optional[float]:
    if owner == "Gemeinsam":
        row = conn.execute("SELECT SUM(balance) AS total FROM broker_cash").fetchone()
    else:
        row = conn.execute(
            "SELECT SUM(balance) AS total FROM broker_cash WHERE owner=?", (owner,)
        ).fetchone()
    total = row["total"] if row else None
    return round(float(total), 2) if total is not None else None


def upsert_broker_cash(
    conn: sqlite3.Connection,
    owner: str,
    broker: str,
    balance: float,
    last_import: Optional[str] = None,
) -> None:
    conn.execute(
        """INSERT INTO broker_cash (owner, broker, balance, last_import, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(owner, broker) DO UPDATE SET
               balance=excluded.balance,
               last_import=excluded.last_import,
               updated_at=datetime('now')""",
        (owner, broker, balance, last_import),
    )
    conn.commit()
