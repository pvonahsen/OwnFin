import json
import os
import sqlite3
from typing import Generator

# Determine DB_PATH
if os.path.exists("/.dockerenv"):  # Check for standard Docker environment file
    DB_PATH = "/data/dashboard.db"  # Force HA add-on persistent path
else:
    # Fallback for local testing outside Docker/HA (relative to project root)
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _project_root = os.path.dirname(os.path.dirname(_script_dir))  # Go up from finance_tracker/database/
    DB_PATH = os.path.join(_project_root, "data", "dashboard.db")

DEFAULT_SETTINGS = {
    "invested": 0,
    "cash": 0,
    "goal": 100000,
    "totalMo": 120,
    "target_date": None,
    "phase0_end": None,
    "phase1_end": None,
    "ph0": 12,
    "ph1": 36,
    "ph3": 24,
    "sp0": 500,
    "sp1": 500,
    "sp2": 500,
    "sp3": 500,
    "rate": 6.5,
    "rate_ph3": 2.5,
    "ref_month": None,
    "sc_r0": 4.0, "sc_s0": 200, "sc_d0": 500,
    "sc_r1": 6.5, "sc_s1": 500, "sc_d1": 1000,
    "sc_r2": 8.5, "sc_s2": 800, "sc_d2": 2000,
    "capital_gains_tax_rate": 0.275,
    "scheduler_timezone": "Europe/Vienna",
    "scheduler_sync_time": "20:00",
}

# Kept so existing imports don't break. Points to neutral defaults.
DEFAULT_SETTINGS_LENA = DEFAULT_SETTINGS



def get_conn() -> sqlite3.Connection:
    import database.core as _self
    _db_path = _self.DB_PATH
    db_dir = os.path.dirname(os.path.abspath(_db_path))
    os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(_db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()


# ── Migration tracking ────────────────────────────────────────────────────────

def _ensure_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id         TEXT PRIMARY KEY,
            applied_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()


def _run_once(conn: sqlite3.Connection, migration_id: str, fn) -> None:
    """Run fn(conn) exactly once across all startups, tracked in schema_migrations."""
    if conn.execute("SELECT 1 FROM schema_migrations WHERE id=?", (migration_id,)).fetchone():
        return
    fn(conn)
    conn.execute("INSERT INTO schema_migrations (id) VALUES (?)", (migration_id,))
    conn.commit()


# ── Migrations ────────────────────────────────────────────────────────────────

def _migrate_owner_columns(conn: sqlite3.Connection) -> None:
    for table in ["positions", "sparplans"]:
        cols = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if "owner" not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN owner TEXT DEFAULT 'Paul'")


def _migrate_checkins_table(conn: sqlite3.Connection) -> None:
    cols = [row[1] for row in conn.execute("PRAGMA table_info(checkins)").fetchall()]
    if "owner" not in cols:
        conn.executescript("""
            ALTER TABLE checkins RENAME TO checkins_legacy;
            CREATE TABLE checkins (
                owner      TEXT NOT NULL DEFAULT 'Paul',
                month      TEXT NOT NULL,
                invested   REAL NOT NULL,
                cash       REAL NOT NULL,
                total      REAL NOT NULL,
                note       TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (owner, month)
            );
            INSERT INTO checkins (owner, month, invested, cash, total, note, created_at, updated_at)
            SELECT 'Paul', month, invested, cash, total, note, created_at, updated_at
            FROM checkins_legacy;
            DROP TABLE checkins_legacy;
        """)
    # Rename month → date if not yet done
    cols = [row[1] for row in conn.execute("PRAGMA table_info(checkins)").fetchall()]
    if "date" not in cols and "month" in cols:
        conn.execute("ALTER TABLE checkins RENAME COLUMN month TO date")
        conn.commit()


def _migrate_settings(conn: sqlite3.Connection) -> None:
    # No-op: historical single-user → multi-user settings migration.
    # Migration ID kept registered so existing DBs don't re-run it.
    pass


def _migrate_new_positions(conn: sqlite3.Connection) -> None:
    # No-op: positions are no longer seeded from hardcoded defaults.
    # Migration ID kept registered so existing DBs don't re-run it.
    pass


def _migrate_rate_ph3(conn: sqlite3.Connection) -> None:
    """Ensure rate_ph3 exists in all settings rows (default 2.5%)."""
    rows = conn.execute(
        "SELECT key FROM settings WHERE key LIKE 'main_%'"
    ).fetchall()
    for row in rows:
        key = row["key"]
        s_row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        if not s_row:
            continue
        s = json.loads(s_row["value"])
        if "rate_ph3" not in s:
            s["rate_ph3"] = 2.5
            conn.execute("UPDATE settings SET value=? WHERE key=?", (json.dumps(s), key))
    conn.commit()


def _migrate_certificate_asset_class(conn: sqlite3.Connection) -> None:
    # Retired: personal-data migration, no-op on public installs.
    pass


def _migrate_fix_tickers(conn: sqlite3.Connection) -> None:
    """Replace bad Yahoo Finance tickers with verified working ones."""
    fixes = {
        "Amundi MSCI World SRI PAB": "XAMB.DE",
        "Amundi MSCI Europe SRI":    "EUSRI.MI",
        "Amundi MSCI EM Ex China":   "EMXC.DE",
        "Vanguard ESG Dev. Europe":  "V3EA.AS",
        "Vanguard ESG EM All Cap":   "V3MA.DE",
        "First Trust Smart Grid":    "GRID.DE",
        "Nvidia":                    "NVD.DE",
        "Dell":                      "12DA.DE",
        "Microsoft":                 "MSF.DE",
        "Adobe":                     "ADB.DE",
    }
    for name, ticker in fixes.items():
        conn.execute("UPDATE positions SET ticker=? WHERE name=?", (ticker, name))
    conn.commit()


def _migrate_fix_kauf_verkauf_bug(conn: sqlite3.Connection) -> None:
    # One-time data correction (2024): removed a TMC sell wrongly stored as a buy.
    # Already ran on all deployed DBs (recorded in schema_migrations). No-op on fresh DBs.
    pass


def _migrate_fix_bitpanda_sells(conn: sqlite3.Connection) -> None:
    # One-time data correction (2024): removed Bitpanda sells wrongly stored as buys.
    # Already ran on all deployed DBs (recorded in schema_migrations). No-op on fresh DBs.
    pass


def _migrate_split_siemens_smp(conn: sqlite3.Connection) -> None:
    # Retired: personal-data migration, no-op on public installs.
    pass


def _migrate_siemens_position(conn: sqlite3.Connection) -> None:
    # Retired: personal-data migration, no-op on public installs.
    pass


def _migrate_add_sale_price(conn: sqlite3.Connection) -> None:
    """Add sale_price column to transactions table for tracking realized gains."""
    cols = [row[1] for row in conn.execute("PRAGMA table_info(transactions)").fetchall()]
    if "sale_price" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN sale_price REAL")
        conn.commit()


def _migrate_add_broker_cash_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS broker_cash (
            owner        TEXT NOT NULL,
            broker       TEXT NOT NULL,
            balance      REAL NOT NULL DEFAULT 0,
            last_import  TEXT,
            updated_at   TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (owner, broker)
        )
    """)
    conn.commit()


def _init_defaults(conn: sqlite3.Connection) -> None:
    # No-op: positions are created on demand via CSV import or manual entry.
    # Migration ID kept registered so existing DBs don't re-run it.
    pass


def _migrate_banking_hash_per_account(conn):
    """Switch bank_transactions dedup from global UNIQUE(imported_hash) to
    per-account UNIQUE(account_id, imported_hash). Clears all banking data
    since the hash function also changes (adds account_subtype). User will reimport."""
    conn.executescript("""
        DELETE FROM bank_transactions;
        DELETE FROM bank_accounts;
        DROP TABLE IF EXISTS bank_transactions;
        CREATE TABLE bank_transactions (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id        INTEGER NOT NULL REFERENCES bank_accounts(id),
            date              TEXT NOT NULL,
            amount            REAL NOT NULL,
            description       TEXT,
            counterparty      TEXT,
            counterparty_iban TEXT,
            booking_type      TEXT,
            original_category TEXT,
            custom_category   TEXT,
            is_transfer       INTEGER DEFAULT 0,
            split_ratio       REAL DEFAULT 1.0,
            notes             TEXT,
            imported_hash     TEXT,
            created_at        TEXT DEFAULT (datetime('now')),
            UNIQUE(account_id, imported_hash)
        );
    """)
    conn.commit()


def _migrate_category_icons_to_named(conn):
    """Replace emoji icons in bank_categories with named icon identifiers for SVG rendering."""
    _EMOJI_TO_ICON = {
        "💼": "briefcase", "🏠": "home", "🛒": "shopping-cart", "🍽": "coffee",
        "📈": "trending-up", "🏦": "archive", "📊": "bar-chart-2", "🚌": "navigation",
        "📚": "book-open", "📺": "monitor", "👕": "tag", "🏋": "activity",
        "💳": "credit-card", "🪑": "box", "💵": "dollar-sign", "💻": "cpu",
        "✈": "map-pin", "🧴": "droplet", "🎮": "star", "📦": "package",
        "🛡": "shield", "🎭": "film", "❓": "help-circle",
    }
    for emoji, name in _EMOJI_TO_ICON.items():
        conn.execute("UPDATE bank_categories SET icon=? WHERE icon=?", (name, emoji))
    conn.commit()


_DEFAULT_BANK_CATEGORIES = [
    {"name": "Einkommen",           "type": "income",    "color": "#22c55e", "icon": "briefcase",     "split_default": 1.0, "bucket": "guilt"},
    {"name": "Haushalt",            "type": "expense",   "color": "#6366f1", "icon": "home",          "split_default": 1.0, "bucket": "goals"},
    {"name": "Lebensmittel",        "type": "expense",   "color": "#84cc16", "icon": "shopping-cart", "split_default": 1.0, "bucket": "goals"},
    {"name": "Restaurants & Bars",  "type": "expense",   "color": "#f97316", "icon": "coffee",        "split_default": 1.0, "bucket": "guilt"},
    {"name": "Sparen & Investieren","type": "transfer",  "color": "#3b82f6", "icon": "trending-up",   "split_default": 1.0, "bucket": "invest"},
    {"name": "Sparen",              "type": "transfer",  "color": "#f59e0b", "icon": "archive",       "split_default": 1.0, "bucket": "goals"},
    {"name": "Investieren",         "type": "transfer",  "color": "#2563eb", "icon": "bar-chart-2",   "split_default": 1.0, "bucket": "invest"},
    {"name": "Mobilität",           "type": "expense",   "color": "#06b6d4", "icon": "navigation",    "split_default": 1.0, "bucket": "fix"},
    {"name": "Bildung",             "type": "expense",   "color": "#8b5cf6", "icon": "book-open",     "split_default": 1.0, "bucket": "guilt"},
    {"name": "Medien",              "type": "expense",   "color": "#ec4899", "icon": "monitor",       "split_default": 1.0, "bucket": "fix"},
    {"name": "Kleidung",            "type": "expense",   "color": "#f59e0b", "icon": "tag",           "split_default": 1.0, "bucket": "guilt"},
    {"name": "Fitness",             "type": "expense",   "color": "#10b981", "icon": "activity",      "split_default": 1.0, "bucket": "fix"},
    {"name": "Finanzen",            "type": "expense",   "color": "#64748b", "icon": "credit-card",   "split_default": 1.0, "bucket": "fix"},
    {"name": "Zuhause",             "type": "expense",   "color": "#7c3aed", "icon": "box",           "split_default": 1.0, "bucket": "fix"},
    {"name": "Bargeld",             "type": "expense",   "color": "#9ca3af", "icon": "dollar-sign",   "split_default": 1.0, "bucket": "guilt"},
    {"name": "Elektronik",          "type": "expense",   "color": "#0ea5e9", "icon": "cpu",           "split_default": 1.0, "bucket": "guilt"},
    {"name": "Reisen",              "type": "expense",   "color": "#14b8a6", "icon": "map-pin",       "split_default": 1.0, "bucket": "guilt"},
    {"name": "Drogerie",            "type": "expense",   "color": "#f43f5e", "icon": "droplet",       "split_default": 1.0, "bucket": "fix"},
    {"name": "Hobby",               "type": "expense",   "color": "#a78bfa", "icon": "star",          "split_default": 1.0, "bucket": "guilt"},
    {"name": "Online-Shopping",     "type": "expense",   "color": "#fb923c", "icon": "package",       "split_default": 1.0, "bucket": "guilt"},
    {"name": "Versicherungen",      "type": "expense",   "color": "#78716c", "icon": "shield",        "split_default": 1.0, "bucket": "fix"},
    {"name": "Kultur",              "type": "expense",   "color": "#e879f9", "icon": "film",          "split_default": 1.0, "bucket": "guilt"},
    {"name": "Andere",              "type": "expense",   "color": "#6b7280", "icon": "help-circle",   "split_default": 1.0, "bucket": "guilt"},
]

def _migrate_banking_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            account_type TEXT DEFAULT 'checking',
            owner        TEXT NOT NULL,
            bank         TEXT DEFAULT 'Tomorrow',
            iban         TEXT,
            currency     TEXT DEFAULT 'EUR',
            is_active    BOOLEAN DEFAULT 1,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS bank_transactions (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id        INTEGER NOT NULL REFERENCES bank_accounts(id),
            date              TEXT NOT NULL,
            amount            REAL NOT NULL,
            description       TEXT,
            counterparty      TEXT,
            counterparty_iban TEXT,
            booking_type      TEXT,
            original_category TEXT,
            custom_category   TEXT,
            is_transfer       INTEGER DEFAULT 0,
            split_ratio       REAL DEFAULT 1.0,
            notes             TEXT,
            imported_hash     TEXT UNIQUE,
            created_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS bank_categories (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT UNIQUE NOT NULL,
            type          TEXT DEFAULT 'expense',
            color         TEXT DEFAULT '#6b7280',
            icon          TEXT DEFAULT '💳',
            split_default REAL DEFAULT 1.0
        );

        CREATE TABLE IF NOT EXISTS bank_budgets (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            owner    TEXT NOT NULL DEFAULT 'Paul',
            month    TEXT NOT NULL,
            amount   REAL NOT NULL,
            UNIQUE(category, owner, month)
        );

        CREATE TABLE IF NOT EXISTS bank_cat_rules (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword   TEXT NOT NULL,
            field     TEXT NOT NULL DEFAULT 'description',
            match_type TEXT NOT NULL DEFAULT 'contains',
            category  TEXT NOT NULL,
            priority  INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS own_accounts (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            iban  TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL DEFAULT ''
        );
    """)
    # Add bucket column if not yet present (migration for existing DBs)
    try:
        conn.execute("ALTER TABLE bank_categories ADD COLUMN bucket TEXT DEFAULT 'guilt'")
        conn.commit()
        # Set sensible initial bucket values for rows that were just defaulted to 'guilt'
        conn.executescript("""
            UPDATE bank_categories SET bucket='fix'    WHERE name IN ('Mobilität','Medien','Fitness','Finanzen','Zuhause','Drogerie','Versicherungen') AND bucket='guilt';
            UPDATE bank_categories SET bucket='invest' WHERE name IN ('Sparen & Investieren','Investieren') AND bucket='guilt';
            UPDATE bank_categories SET bucket='goals'  WHERE name IN ('Lebensmittel','Haushalt','Sparen') AND bucket='guilt';
        """)
    except Exception:
        pass  # column already exists

    # Ensure split categories exist in existing DBs (INSERT OR IGNORE = safe to re-run)
    for c in [
        {"name": "Sparen",      "type": "transfer", "color": "#f59e0b", "icon": "archive",     "split_default": 1.0, "bucket": "goals"},
        {"name": "Investieren", "type": "transfer", "color": "#2563eb", "icon": "bar-chart-2", "split_default": 1.0, "bucket": "invest"},
    ]:
        conn.execute(
            "INSERT OR IGNORE INTO bank_categories (name, type, color, icon, split_default, bucket) VALUES (?,?,?,?,?,?)",
            (c["name"], c["type"], c["color"], c["icon"], c["split_default"], c["bucket"]),
        )
    conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM bank_categories").fetchone()[0]
    if count == 0:
        for c in _DEFAULT_BANK_CATEGORIES:
            conn.execute(
                "INSERT OR IGNORE INTO bank_categories (name, type, color, icon, split_default, bucket) VALUES (?,?,?,?,?,?)",
                (c["name"], c["type"], c["color"], c["icon"], c["split_default"], c["bucket"]),
            )
    conn.commit()


def _migrate_create_users_table(conn: sqlite3.Connection) -> None:
    """
    Seed the users table from existing owner data in the DB.
    On existing installs this detects owners from data and creates user records automatically.
    On a fresh install this is a no-op — the setup wizard creates users instead.
    """
    # Collect every distinct owner that has actual data
    owners: set = set()
    for table in ("positions", "checkins", "sparplans", "transactions",
                  "bank_accounts", "bank_budgets", "broker_cash"):
        try:
            rows = conn.execute(f"SELECT DISTINCT owner FROM {table}").fetchall()
            owners.update(r["owner"] for r in rows if r["owner"])
        except Exception:
            pass
    # Also check settings keys (main_<owner> pattern)
    for row in conn.execute("SELECT key FROM settings WHERE key LIKE 'main_%'").fetchall():
        owner = row["key"][len("main_"):]
        owners.add(owner)

    # Palette for auto-assigned colors
    _COLORS = ["#4D78B8", "#C2806A", "#22c55e", "#f97316", "#8b5cf6", "#ec4899"]
    regular = sorted(o for o in owners if o != "Gemeinsam")

    for i, owner in enumerate(regular):
        color = _COLORS[i % len(_COLORS)]
        conn.execute(
            """INSERT OR IGNORE INTO users (id, display_name, color, is_aggregate, member_ids)
               VALUES (?, ?, ?, 0, NULL)""",
            (owner, owner, color),
        )

    # Re-create Gemeinsam as an aggregate of all regular users
    if regular:
        conn.execute(
            """INSERT OR IGNORE INTO users (id, display_name, color, is_aggregate, member_ids)
               VALUES ('Gemeinsam', 'Gemeinsam', '#6366f1', 1, ?)""",
            (",".join(regular),),
        )
    conn.commit()


def _migrate_create_phases_table(conn: sqlite3.Connection) -> None:
    """Migrate existing sp0/sp1/sp2/sp3/ph0/ph1/ph3 settings to the phases table."""
    for row in conn.execute("SELECT key, value FROM settings WHERE key LIKE 'main_%'").fetchall():
        owner = row["key"][len("main_"):]
        try:
            s = json.loads(row["value"])
        except Exception:
            continue
        if conn.execute("SELECT COUNT(*) FROM phases WHERE owner=?", (owner,)).fetchone()[0] > 0:
            continue
        ph0 = s.get("ph0") or 0
        ph1 = s.get("ph1") or 0
        ph3 = s.get("ph3") or 0
        total_mo = s.get("totalMo") or 120
        ph2 = max(0, total_mo - ph0 - ph1 - ph3)

        raw = [
            ("", ph0, s.get("sp0", 0)),
            ("", ph1, s.get("sp1", 0)),
            ("", ph2, s.get("sp2", 0)),
            ("", None, s.get("sp3", 0)),
        ]
        # Drop intermediate phases with zero duration
        valid = [(n, d, sv) for n, d, sv in raw[:-1] if d and d > 0]
        valid.append(raw[-1])  # always keep last phase
        # Ensure the last entry has duration=None
        if valid:
            n, _, sv = valid[-1]
            valid[-1] = (n, None, sv)

        for idx, (name, dur, savings) in enumerate(valid):
            conn.execute(
                "INSERT OR IGNORE INTO phases "
                "(owner, phase_index, name, duration_months, monthly_savings) VALUES (?,?,?,?,?)",
                (owner, idx, name, dur, savings),
            )
    conn.commit()


def _migrate_add_scheduler_tax_fields(conn: sqlite3.Connection) -> None:
    """Add capital_gains_tax_rate, scheduler_timezone, scheduler_sync_time to all settings rows."""
    new_fields = {
        "capital_gains_tax_rate": 0.275,
        "scheduler_timezone": "Europe/Vienna",
        "scheduler_sync_time": "20:00",
    }
    rows = conn.execute("SELECT key, value FROM settings WHERE key LIKE 'main_%'").fetchall()
    for row in rows:
        s = json.loads(row["value"])
        updated = False
        for field, default in new_fields.items():
            if field not in s:
                s[field] = default
                updated = True
        if updated:
            conn.execute("UPDATE settings SET value=? WHERE key=?", (json.dumps(s), row["key"]))
    conn.commit()


def init_db() -> None:
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id           TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            color        TEXT DEFAULT '#6366f1',
            is_aggregate INTEGER DEFAULT 0,
            member_ids   TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS phases (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            owner           TEXT NOT NULL,
            phase_index     INTEGER NOT NULL,
            name            TEXT NOT NULL DEFAULT '',
            duration_months INTEGER,
            monthly_savings REAL NOT NULL DEFAULT 0,
            UNIQUE(owner, phase_index)
        );

        CREATE TABLE IF NOT EXISTS positions (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL,
            ticker         TEXT,
            isin           TEXT,
            units          REAL DEFAULT 0,
            avg_buy_price  REAL DEFAULT 0,
            monthly_rate   REAL DEFAULT 0,
            target_weight  REAL DEFAULT 0,
            asset_class    TEXT DEFAULT 'etf',
            is_active      BOOLEAN DEFAULT 1,
            notes          TEXT,
            owner          TEXT,
            created_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS prices (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER REFERENCES positions(id),
            date        TEXT NOT NULL,
            price       REAL NOT NULL,
            currency    TEXT DEFAULT 'EUR',
            UNIQUE(position_id, date)
        );

        CREATE TABLE IF NOT EXISTS dividends (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id     INTEGER REFERENCES positions(id),
            date            TEXT NOT NULL,
            amount_per_unit REAL NOT NULL,
            total_amount    REAL NOT NULL,
            created_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(position_id, date)
        );

        CREATE TABLE IF NOT EXISTS checkins (
            owner      TEXT NOT NULL,
            date       TEXT NOT NULL,
            invested   REAL NOT NULL,
            cash       REAL NOT NULL,
            total      REAL NOT NULL,
            note       TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (owner, date)
        );

        CREATE TABLE IF NOT EXISTS sparplans (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id    INTEGER REFERENCES positions(id),
            monthly_amount REAL NOT NULL,
            execution_day  INTEGER DEFAULT 1,
            is_active      BOOLEAN DEFAULT 1,
            started_at     TEXT,
            notes          TEXT,
            owner          TEXT
        );

        CREATE TABLE IF NOT EXISTS imports (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            source         TEXT,
            imported_at    TEXT DEFAULT (datetime('now')),
            rows_processed INTEGER,
            month_created  TEXT
        );

        CREATE TABLE IF NOT EXISTS baselines (
            owner           TEXT PRIMARY KEY,
            ref_month       TEXT NOT NULL,
            start_value     REAL NOT NULL,
            projection_json TEXT NOT NULL,
            fixed_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL REFERENCES positions(id),
            owner       TEXT NOT NULL,
            date        TEXT NOT NULL,
            units       REAL NOT NULL,
            price       REAL NOT NULL,
            type        TEXT DEFAULT 'buy',
            notes       TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );
    """)

    # Structural DDL migrations — always safe to run (idempotent)
    _migrate_owner_columns(conn)
    _migrate_checkins_table(conn)
    _migrate_banking_tables(conn)

    # Migration tracking — must exist before _run_once calls
    _ensure_migrations_table(conn)

    # Data migrations — run exactly once per database
    _run_once(conn, "settings_init",           _migrate_settings)
    _run_once(conn, "init_defaults",           _init_defaults)
    _run_once(conn, "new_positions_v1",        _migrate_new_positions)
    _run_once(conn, "fix_tickers_v1",          _migrate_fix_tickers)
    _run_once(conn, "fix_kauf_verkauf_bug",    _migrate_fix_kauf_verkauf_bug)
    _run_once(conn, "fix_bitpanda_sells",      _migrate_fix_bitpanda_sells)
    _run_once(conn, "siemens_position_v1",     _migrate_siemens_position)
    _run_once(conn, "split_siemens_smp_v1",    _migrate_split_siemens_smp)
    _run_once(conn, "certificate_asset_class", _migrate_certificate_asset_class)
    _run_once(conn, "rate_ph3",                _migrate_rate_ph3)
    _run_once(conn, "add_sale_price_column",   _migrate_add_sale_price)
    _run_once(conn, "banking_hash_per_account_v1", _migrate_banking_hash_per_account)
    _run_once(conn, "category_icons_named_v1",    _migrate_category_icons_to_named)
    _run_once(conn, "add_broker_cash_v1",          _migrate_add_broker_cash_table)
    _run_once(conn, "create_users_v1",             _migrate_create_users_table)
    _run_once(conn, "create_phases_v1",            _migrate_create_phases_table)
    _run_once(conn, "add_scheduler_tax_fields_v1", _migrate_add_scheduler_tax_fields)

    # Startup recalculation — not a migration, always runs
    _recalc_all_positions(conn)

    conn.commit()
    conn.close()


def _recalc_all_positions(conn: sqlite3.Connection) -> None:
    """On startup: recalculate units/avg_buy_price for every position from its
    transactions and auto-deactivate any that have been fully sold out."""
    import logging
    log = logging.getLogger(__name__)
    pos_ids = [r[0] for r in conn.execute("SELECT id FROM positions").fetchall()]
    deactivated = []
    for pos_id in pos_ids:
        txns = conn.execute(
            "SELECT t.units, t.price FROM transactions t WHERE t.position_id=? ORDER BY t.date",
            (pos_id,),
        ).fetchall()
        if not txns:
            continue
        net_units = round(sum(t["units"] for t in txns), 8)
        buys = [t for t in txns if t["units"] > 0]
        total_buy_units = sum(t["units"] for t in buys)
        total_buy_cost  = sum(t["units"] * t["price"] for t in buys)
        avg_price = round(total_buy_cost / total_buy_units, 6) if total_buy_units > 0 else 0
        if net_units < 0.0001:
            name = conn.execute("SELECT name FROM positions WHERE id=?", (pos_id,)).fetchone()["name"]
            conn.execute(
                "UPDATE positions SET units=0, avg_buy_price=?, is_active=0 WHERE id=?",
                (avg_price, pos_id),
            )
            deactivated.append(name)
        else:
            # net_units > 0 means position is still open — always re-activate
            conn.execute(
                "UPDATE positions SET units=?, avg_buy_price=?, is_active=1 WHERE id=?",
                (net_units, avg_price, pos_id),
            )
    if deactivated:
        log.info(f"Startup-Recalc: {len(deactivated)} Positionen deaktiviert (verkauft): {', '.join(deactivated)}")
