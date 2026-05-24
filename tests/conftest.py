import json
import sqlite3
import pytest
from datetime import date
from unittest.mock import patch
from fastapi.testclient import TestClient

BASE_SETTINGS = {
    "totalMo": 96,
    "ph0": 6,
    "ph1": 12,
    "ph3": 12,
    "sp0": 1000.0,
    "sp1": 800.0,
    "sp2": 1500.0,
    "sp3": 500.0,
    "rate": 6.0,
    "goal": 300000,
    "ref_month": "2026-04",
}

# ph2 = totalMo - ph0 - ph1 - ph3 = 96 - 6 - 12 - 12 = 66
BASE_PHASES = [
    {"phase_index": 0, "name": "", "duration_months": 6,    "monthly_savings": 1000.0},
    {"phase_index": 1, "name": "", "duration_months": 12,   "monthly_savings": 800.0},
    {"phase_index": 2, "name": "", "duration_months": 66,   "monthly_savings": 1500.0},
    {"phase_index": 3, "name": "", "duration_months": None, "monthly_savings": 500.0},
]

@pytest.fixture
def settings():
    return dict(BASE_SETTINGS)

@pytest.fixture
def phases():
    return [dict(p) for p in BASE_PHASES]


# ── Integration test fixtures ─────────────────────────────────────────────────

@pytest.fixture
def test_db_path(tmp_path):
    """Fresh fully-initialized database in a temp directory."""
    import sqlite3 as _sqlite3
    import database.core as db_core
    import database as db_mod
    db_file = str(tmp_path / "test.db")
    original = db_core.DB_PATH
    db_core.DB_PATH = db_file
    db_mod.init_db()
    # Seed the two regular test users and the aggregate view that many tests expect.
    conn = _sqlite3.connect(db_file)
    conn.execute(
        "INSERT OR IGNORE INTO users (id, display_name, color, is_aggregate, member_ids) "
        "VALUES ('Paul', 'Paul', '#4D78B8', 0, NULL)"
    )
    conn.execute(
        "INSERT OR IGNORE INTO users (id, display_name, color, is_aggregate, member_ids) "
        "VALUES ('Lena', 'Lena', '#C2806A', 0, NULL)"
    )
    conn.execute(
        "INSERT OR IGNORE INTO users (id, display_name, color, is_aggregate, member_ids) "
        "VALUES ('Gemeinsam', 'Gemeinsam', '#6366f1', 1, 'Paul,Lena')"
    )
    conn.commit()
    conn.close()
    yield db_file
    db_core.DB_PATH = original


@pytest.fixture
def db_conn(test_db_path):
    """Direct SQLite connection to the test DB for test data setup."""
    conn = sqlite3.connect(test_db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    yield conn
    conn.close()


@pytest.fixture
def client(test_db_path):
    """FastAPI TestClient wired to the test database."""
    import database as db_mod
    from main import app

    def override_get_db():
        conn = sqlite3.connect(test_db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[db_mod.get_db] = override_get_db

    with patch("database.init_db"), \
         patch("scheduler.start_scheduler"), \
         patch("scheduler.stop_scheduler"):
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.clear()
