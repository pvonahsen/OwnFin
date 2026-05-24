import sqlite3


def get_phases(conn: sqlite3.Connection, owner: str) -> list:
    rows = conn.execute(
        "SELECT phase_index, name, duration_months, monthly_savings "
        "FROM phases WHERE owner=? ORDER BY phase_index",
        (owner,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_phases_gemeinsam(conn: sqlite3.Connection) -> list:
    """Aggregate phases: sum monthly_savings per phase_index across all regular users."""
    from .users import get_regular_users
    members = get_regular_users(conn)
    if not members:
        return []
    per_user = [get_phases(conn, u["id"]) for u in members]
    max_len = max((len(p) for p in per_user), default=0)
    if max_len == 0:
        return []
    result = []
    for i in range(max_len):
        total_savings = 0.0
        name = ""
        duration = None
        for user_phases in per_user:
            if i < len(user_phases):
                ph = user_phases[i]
                total_savings += ph["monthly_savings"]
                if not name:
                    name = ph.get("name", "")
                if ph["duration_months"] is not None:
                    duration = ph["duration_months"]
        result.append({
            "phase_index": i,
            "name": name,
            "duration_months": duration if i < max_len - 1 else None,
            "monthly_savings": total_savings,
        })
    return result


def save_phases(conn: sqlite3.Connection, owner: str, phases: list) -> None:
    conn.execute("DELETE FROM phases WHERE owner=?", (owner,))
    for i, ph in enumerate(phases):
        conn.execute(
            "INSERT INTO phases (owner, phase_index, name, duration_months, monthly_savings) "
            "VALUES (?,?,?,?,?)",
            (owner, i, ph.get("name", ""), ph.get("duration_months"), ph.get("monthly_savings", 0)),
        )
    conn.commit()
