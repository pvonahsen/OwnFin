import json
import sqlite3
from typing import Optional

from .core import DEFAULT_SETTINGS


# ── Settings ──────────────────────────────────────────────────────────────────

# Fields that must stay in sync across all users (shared timeline)
_SHARED_DATE_FIELDS = {"phase0_end", "phase1_end", "target_date", "ph3", "ref_month"}


def _months_between(start_ym: str, end_ym: str) -> int:
    sy, sm = map(int, start_ym.split("-"))
    ey, em = map(int, end_ym.split("-"))
    return (ey - sy) * 12 + (em - sm)


def get_settings(conn: sqlite3.Connection, owner: str) -> dict:
    key = f"main_{owner}"
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    if not row:
        # Legacy fallback: try the old 'main' key (pre-multi-user)
        row = conn.execute("SELECT value FROM settings WHERE key='main'").fetchone()
    s = json.loads(row["value"]) if row else DEFAULT_SETTINGS.copy()

    # Derive ph0, ph1, totalMo from date fields whenever they are present
    ref = s.get("ref_month") or ""
    if ref:
        if s.get("phase0_end"):
            s["ph0"] = max(1, _months_between(ref, s["phase0_end"]))
        if s.get("phase0_end") and s.get("phase1_end"):
            s["ph1"] = max(1, _months_between(s["phase0_end"], s["phase1_end"]))
        if s.get("target_date"):
            s["totalMo"] = max(1, _months_between(ref, s["target_date"]))
    return s


def get_settings_gemeinsam(conn: sqlite3.Connection, member_ids: Optional[list] = None) -> dict:
    """Return combined settings for an aggregate user.

    member_ids: list of regular user IDs to sum. If None, looks up the
    Gemeinsam user's member_ids from the users table; falls back to reading
    all non-aggregate users.
    """
    if member_ids is None:
        try:
            row = conn.execute(
                "SELECT member_ids FROM users WHERE id='Gemeinsam'"
            ).fetchone()
            if row and row["member_ids"]:
                member_ids = row["member_ids"].split(",")
        except Exception:
            pass

    if not member_ids:
        try:
            rows = conn.execute(
                "SELECT id FROM users WHERE is_aggregate=0 ORDER BY created_at"
            ).fetchall()
            member_ids = [r["id"] for r in rows]
        except Exception:
            member_ids = []

    if not member_ids:
        return DEFAULT_SETTINGS.copy()

    all_settings = [get_settings(conn, uid) for uid in member_ids]
    combined = {**all_settings[0]}
    for extra in all_settings[1:]:
        for field in ["sp0", "sp1", "sp2", "sp3", "goal", "cash",
                      "sc_s0", "sc_s1", "sc_s2", "sc_d0", "sc_d1", "sc_d2"]:
            combined[field] = combined.get(field, 0) + extra.get(field, 0)
    return combined


def save_settings(conn: sqlite3.Connection, data: dict, owner: str) -> None:
    key = f"main_{owner}"
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, json.dumps(data)),
    )
    # Sync shared date fields to every other non-aggregate user
    shared = {k: v for k, v in data.items() if k in _SHARED_DATE_FIELDS}
    if shared:
        try:
            others = conn.execute(
                "SELECT id FROM users WHERE is_aggregate=0 AND id!=?", (owner,)
            ).fetchall()
            other_ids = [r["id"] for r in others]
        except Exception:
            other_ids = []
        for other in other_ids:
            other_s = get_settings(conn, other)
            other_s.update(shared)
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (f"main_{other}", json.dumps(other_s)),
            )
    conn.commit()


# ── Check-ins ─────────────────────────────────────────────────────────────────

def _is_aggregate(conn: sqlite3.Connection, owner: str) -> bool:
    """Return True if owner is an aggregate/combined user."""
    try:
        row = conn.execute("SELECT is_aggregate FROM users WHERE id=?", (owner,)).fetchone()
        return bool(row["is_aggregate"]) if row else False
    except Exception:
        return False


def get_checkins(conn: sqlite3.Connection, owner: Optional[str] = None) -> list:
    if owner and _is_aggregate(conn, owner):
        # Sum checkins across all member users of this aggregate
        try:
            members_row = conn.execute(
                "SELECT member_ids FROM users WHERE id=?", (owner,)
            ).fetchone()
            if members_row and members_row["member_ids"]:
                member_list = members_row["member_ids"].split(",")
                placeholders = ",".join("?" * len(member_list))
                rows = conn.execute(f"""
                    SELECT date,
                           SUM(invested) AS invested,
                           SUM(cash)     AS cash,
                           SUM(total)    AS total,
                           NULL          AS note,
                           MAX(created_at) AS created_at,
                           MAX(updated_at) AS updated_at
                    FROM checkins WHERE owner IN ({placeholders})
                    GROUP BY date ORDER BY date ASC
                """, member_list).fetchall()
            else:
                rows = conn.execute("""
                    SELECT date,
                           SUM(invested) AS invested,
                           SUM(cash)     AS cash,
                           SUM(total)    AS total,
                           NULL          AS note,
                           MAX(created_at) AS created_at,
                           MAX(updated_at) AS updated_at
                    FROM checkins GROUP BY date ORDER BY date ASC
                """).fetchall()
        except Exception:
            rows = []
    elif owner:
        rows = conn.execute(
            "SELECT * FROM checkins WHERE owner=? ORDER BY date ASC", (owner,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM checkins ORDER BY date ASC").fetchall()
    return [dict(r) for r in rows]


def get_checkin(conn: sqlite3.Connection, date_str: str, owner: str) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM checkins WHERE owner=? AND date=?", (owner, date_str)
    ).fetchone()
    return dict(row) if row else None


def upsert_checkin(
    conn: sqlite3.Connection,
    date_str: str,
    invested: float,
    cash: float,
    note: Optional[str] = None,
    owner: str = "",
) -> None:
    conn.execute(
        """INSERT INTO checkins (owner, date, invested, cash, total, note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(owner, date) DO UPDATE SET
               invested=excluded.invested, cash=excluded.cash, total=excluded.total,
               note=excluded.note, updated_at=datetime('now')""",
        (owner, date_str, invested, cash, invested + cash, note),
    )
    conn.commit()


def delete_checkin(conn: sqlite3.Connection, date_str: str, owner: str) -> None:
    conn.execute("DELETE FROM checkins WHERE owner=? AND date=?", (owner, date_str))
    conn.commit()
