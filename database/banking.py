import sqlite3
from typing import Optional


# -- Own Accounts (own IBANs for transfer detection) --------------------------

def get_own_accounts(conn):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM own_accounts ORDER BY id"
    ).fetchall()]


def add_own_account(conn, iban: str, label: str = "") -> int:
    cur = conn.execute(
        "INSERT INTO own_accounts (iban, label) VALUES (?, ?)", (iban.strip(), label.strip())
    )
    conn.commit()
    return cur.lastrowid


def delete_own_account(conn, account_id: int) -> None:
    conn.execute("DELETE FROM own_accounts WHERE id=?", (account_id,))
    conn.commit()


def get_own_account_ibans(conn) -> set:
    rows = conn.execute("SELECT iban FROM own_accounts").fetchall()
    return {r["iban"] for r in rows}


# -- Bank Accounts ------------------------------------------------------------

def get_bank_accounts(conn, owner=None):
    if not owner or owner == "all":
        rows = conn.execute(
            "SELECT * FROM bank_accounts WHERE is_active=1 ORDER BY id"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM bank_accounts WHERE owner=? AND is_active=1 ORDER BY id",
            (owner,),
        ).fetchall()
    return [dict(r) for r in rows]


def create_bank_account(conn, data):
    cur = conn.execute(
        """INSERT INTO bank_accounts (name, account_type, owner, bank, iban, currency)
           VALUES (:name, :account_type, :owner, :bank, :iban, :currency)""",
        data,
    )
    conn.commit()
    return cur.lastrowid


# -- Bank Transactions --------------------------------------------------------

def get_bank_transactions(
    conn,
    account_id=None,
    owner=None,
    from_date=None,
    to_date=None,
    category=None,
    search=None,
    include_transfers=True,
    limit=500,
    offset=0,
):
    conditions, params = [], []
    if account_id:
        conditions.append("t.account_id=?")
        params.append(account_id)
    if owner and owner != "all":
        if owner == "Gemeinsam":
            conditions.append("a.owner='Gemeinsam'")
        else:
            conditions.append("a.owner=?")
            params.append(owner)
    if from_date:
        conditions.append("t.date>=?")
        params.append(from_date)
    if to_date:
        conditions.append("t.date<=?")
        params.append(to_date)
    if category:
        conditions.append("COALESCE(t.custom_category, t.original_category)=?")
        params.append(category)
    if search:
        conditions.append("(t.description LIKE ? OR t.counterparty LIKE ?)")
        params += [f"%{search}%", f"%{search}%"]
    if not include_transfers:
        conditions.append("t.is_transfer=0")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    if limit and limit > 0:
        query_sql = f"""SELECT t.*, a.name AS account_name, a.owner AS owner
            FROM bank_transactions t
            JOIN bank_accounts a ON t.account_id=a.id
            {where}
            ORDER BY t.date DESC, t.id DESC
            LIMIT ? OFFSET ?"""
        rows = conn.execute(query_sql, params + [limit, offset]).fetchall()
    else:
        query_sql = f"""SELECT t.*, a.name AS account_name, a.owner AS owner
            FROM bank_transactions t
            JOIN bank_accounts a ON t.account_id=a.id
            {where}
            ORDER BY t.date DESC, t.id DESC"""
        rows = conn.execute(query_sql, params).fetchall()
    return [dict(r) for r in rows]


def upsert_bank_transaction(conn, data):
    if data.get("imported_hash"):
        exists = conn.execute(
            "SELECT id FROM bank_transactions WHERE imported_hash=? AND account_id=?",
            (data["imported_hash"], data["account_id"]),
        ).fetchone()
        if exists:
            return None
    cur = conn.execute(
        """INSERT INTO bank_transactions
           (account_id, date, amount, description, counterparty, counterparty_iban,
            booking_type, original_category, custom_category, is_transfer, split_ratio, imported_hash)
           VALUES (:account_id, :date, :amount, :description, :counterparty,
                   :counterparty_iban, :booking_type, :original_category,
                   :custom_category, :is_transfer, :split_ratio, :imported_hash)""",
        {**data, "custom_category": data.get("custom_category")},
    )
    return cur.lastrowid


def update_bank_transaction(conn, tx_id, data):
    allowed = {"custom_category", "split_ratio", "notes", "is_transfer"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{k}=:{k}" for k in fields)
    fields["_id"] = tx_id
    conn.execute(f"UPDATE bank_transactions SET {set_clause} WHERE id=:_id", fields)
    conn.commit()


def delete_bank_transaction(conn, tx_id):
    conn.execute("DELETE FROM bank_transactions WHERE id=?", (tx_id,))
    conn.commit()


# -- Bank Categories ----------------------------------------------------------

def get_bank_categories(conn):
    rows = conn.execute("SELECT * FROM bank_categories ORDER BY type, name").fetchall()
    return [dict(r) for r in rows]


def upsert_bank_category(conn, name, data):
    conn.execute(
        """INSERT INTO bank_categories (name, type, color, icon, split_default, bucket)
           VALUES (:name, :type, :color, :icon, :split_default, :bucket)
           ON CONFLICT(name) DO UPDATE SET
               type=excluded.type, color=excluded.color,
               icon=excluded.icon, split_default=excluded.split_default,
               bucket=excluded.bucket""",
        {"name": name, "bucket": "guilt", **data},
    )
    conn.commit()


def set_category_bucket(conn, name: str, bucket: str) -> None:
    conn.execute("UPDATE bank_categories SET bucket=? WHERE name=?", (bucket, name))
    conn.commit()


# -- Bank Budgets -------------------------------------------------------------

def get_bank_budgets(conn, month, owner: str):
    """Return merged budgets: month-specific entries take priority over templates."""
    # Fetch month-specific entries
    month_rows = conn.execute(
        "SELECT * FROM bank_budgets WHERE month=? AND owner=? ORDER BY category",
        (month, owner),
    ).fetchall()
    month_map = {r["category"]: dict(r) for r in month_rows}

    # Fetch templates (month='template')
    template_rows = conn.execute(
        "SELECT * FROM bank_budgets WHERE month='template' AND owner=? ORDER BY category",
        (owner,),
    ).fetchall()

    # Merge: templates fill in gaps where no month-specific entry exists
    result = dict(month_map)
    for r in template_rows:
        cat = r["category"]
        if cat not in result:
            entry = dict(r)
            entry["is_template"] = True
            result[cat] = entry

    # Mark month-specific ones explicitly
    for cat in month_map:
        result[cat].setdefault("is_template", False)

    return sorted(result.values(), key=lambda x: x["category"])


def get_bank_budget_templates(conn, owner: str):
    rows = conn.execute(
        "SELECT * FROM bank_budgets WHERE month='template' AND owner=? ORDER BY category",
        (owner,),
    ).fetchall()
    return [dict(r) for r in rows]


def upsert_bank_budget(conn, category, owner, month, amount):
    conn.execute(
        """INSERT INTO bank_budgets (category, owner, month, amount) VALUES (?,?,?,?)
           ON CONFLICT(category, owner, month) DO UPDATE SET amount=excluded.amount""",
        (category, owner, month, amount),
    )
    conn.commit()


# -- Auto-categorization rules ------------------------------------------------

def get_cat_rules(conn):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM bank_cat_rules ORDER BY priority DESC, id"
    ).fetchall()]


def upsert_cat_rule(conn, keyword, field, match_type, category, priority=0, rule_id=None):
    if rule_id:
        conn.execute(
            "UPDATE bank_cat_rules SET keyword=?, field=?, match_type=?, category=?, priority=? WHERE id=?",
            (keyword, field, match_type, category, priority, rule_id),
        )
    else:
        conn.execute(
            "INSERT INTO bank_cat_rules (keyword, field, match_type, category, priority) VALUES (?,?,?,?,?)",
            (keyword, field, match_type, category, priority),
        )
    conn.commit()


def delete_cat_rule(conn, rule_id):
    conn.execute("DELETE FROM bank_cat_rules WHERE id=?", (rule_id,))
    conn.commit()


def apply_cat_rule_to_tx(rules, tx: dict) -> Optional[str]:
    """Return the first matching category for a transaction, or None."""
    desc = (tx.get("description") or "").lower()
    cp = (tx.get("counterparty") or "").lower()
    btype = (tx.get("booking_type") or "").lower()
    field_map = {"description": desc, "counterparty": cp, "booking_type": btype}
    for rule in rules:
        target = field_map.get(rule["field"], desc)
        kw = rule["keyword"].lower()
        mt = rule.get("match_type", "contains")
        if mt == "contains" and kw in target:
            return rule["category"]
        elif mt == "exact" and kw == target:
            return rule["category"]
        elif mt == "startswith" and target.startswith(kw):
            return rule["category"]
    return None


def apply_cat_rules_to_all(conn, overwrite=False) -> int:
    """Apply all rules to existing transactions. Returns count of updated rows."""
    rules = get_cat_rules(conn)
    if not rules:
        return 0
    query = "SELECT id, description, counterparty, booking_type, custom_category FROM bank_transactions"
    if not overwrite:
        query += " WHERE custom_category IS NULL OR custom_category = ''"
    txns = [dict(r) for r in conn.execute(query).fetchall()]
    updated = 0
    for tx in txns:
        cat = apply_cat_rule_to_tx(rules, tx)
        if cat:
            conn.execute("UPDATE bank_transactions SET custom_category=? WHERE id=?", (cat, tx["id"]))
            updated += 1
    conn.commit()
    return updated


# -- Cashflow -----------------------------------------------------------------

def get_bank_cashflow(conn, owner=None, months=12):
    from datetime import date, timedelta
    start = str((date.today().replace(day=1) - timedelta(days=months * 30)).replace(day=1))

    owner_filter = ""
    params = [start]
    if owner and owner != "Gemeinsam":
        owner_filter = "AND a.owner=?"
        params.append(owner)

    rows = conn.execute(
        f"""SELECT strftime('%Y-%m', t.date) AS month,
                   SUM(CASE WHEN t.amount > 0 THEN t.amount * t.split_ratio ELSE 0 END) AS income,
                   SUM(CASE WHEN t.amount < 0 THEN t.amount * t.split_ratio ELSE 0 END) AS expenses
            FROM bank_transactions t
            JOIN bank_accounts a ON t.account_id=a.id
            WHERE t.date >= ? AND t.is_transfer=0 {owner_filter}
            GROUP BY month
            ORDER BY month""",
        params,
    ).fetchall()
    return [dict(r) for r in rows]
