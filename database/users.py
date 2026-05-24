import sqlite3
from typing import Optional


def get_users(conn: sqlite3.Connection) -> list:
    rows = conn.execute("SELECT * FROM users ORDER BY is_aggregate, created_at").fetchall()
    return [_row_to_dict(r) for r in rows]


def get_user(conn: sqlite3.Connection, user_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return _row_to_dict(row) if row else None


def get_regular_users(conn: sqlite3.Connection) -> list:
    """Non-aggregate users only — used by scheduler and settings sync."""
    rows = conn.execute(
        "SELECT * FROM users WHERE is_aggregate=0 ORDER BY created_at"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def create_user(
    conn: sqlite3.Connection,
    user_id: str,
    display_name: str,
    color: str = "#6366f1",
    is_aggregate: bool = False,
    member_ids: Optional[list] = None,
) -> dict:
    members = ",".join(member_ids) if member_ids else None
    conn.execute(
        """INSERT INTO users (id, display_name, color, is_aggregate, member_ids)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, display_name, color, 1 if is_aggregate else 0, members),
    )
    conn.commit()
    return get_user(conn, user_id)


def update_user(conn: sqlite3.Connection, user_id: str, data: dict) -> Optional[dict]:
    allowed = {"display_name", "color", "member_ids"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return get_user(conn, user_id)
    if "member_ids" in fields and isinstance(fields["member_ids"], list):
        fields["member_ids"] = ",".join(fields["member_ids"])
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn.execute(
        f"UPDATE users SET {set_clause} WHERE id=?",
        (*fields.values(), user_id),
    )
    conn.commit()
    return get_user(conn, user_id)


def delete_user(conn: sqlite3.Connection, user_id: str) -> bool:
    cur = conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    return cur.rowcount > 0


def needs_setup(conn: sqlite3.Connection) -> bool:
    count = conn.execute(
        "SELECT COUNT(*) FROM users WHERE is_aggregate=0"
    ).fetchone()[0]
    return count == 0


def _row_to_dict(row) -> dict:
    d = dict(row)
    if d.get("member_ids"):
        d["member_ids"] = d["member_ids"].split(",")
    else:
        d["member_ids"] = []
    d["is_aggregate"] = bool(d["is_aggregate"])
    return d
