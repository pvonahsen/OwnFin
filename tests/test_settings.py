"""
Tests for /api/settings.

Key invariants:
- GET returns a dict with expected shape and defaults
- POST saves values and a subsequent GET returns them (round-trip)
- Gemeinsam GET returns combined Paul + Lena savings rates (sp0–sp3 summed)
- Saving a shared date field (phase0_end, phase1_end, target_date, ref_month, ph3)
  propagates that field to the other user's settings
"""
import pytest


# ── Shape / defaults ──────────────────────────────────────────────────────────

EXPECTED_KEYS = {
    "goal", "totalMo", "ph0", "ph1", "ph3",
    "sp0", "sp1", "sp2", "sp3",
    "rate", "ref_month", "cash", "phases",
}


def test_get_settings_paul_returns_expected_shape(client):
    r = client.get("/api/settings?owner=Paul")
    assert r.status_code == 200
    data = r.json()
    assert EXPECTED_KEYS.issubset(data.keys())


def test_get_settings_lena_returns_expected_shape(client):
    r = client.get("/api/settings?owner=Lena")
    assert r.status_code == 200
    data = r.json()
    assert EXPECTED_KEYS.issubset(data.keys())


def test_get_settings_password_excluded(client):
    """password field must never leak through the API."""
    r = client.get("/api/settings?owner=Paul")
    assert "password" not in r.json()


def test_get_settings_paul_defaults_have_positive_rate(client):
    """Default rate should be > 0 for Paul."""
    data = client.get("/api/settings?owner=Paul").json()
    assert data["rate"] > 0


def test_get_settings_paul_cash_default_is_zero(client):
    """Fresh installs: cash = 0."""
    data = client.get("/api/settings?owner=Paul").json()
    assert data["cash"] == 0


# ── POST round-trip ───────────────────────────────────────────────────────────

def test_post_and_get_roundtrip(client):
    """Saving settings and reading them back returns the saved values."""
    payload = {
        "goal": 500000,
        "totalMo": 120,
        "ph0": 6,
        "ph1": 24,
        "ph3": 12,
        "sp0": 1200.0,
        "sp1": 800.0,
        "sp2": 1800.0,
        "sp3": 600.0,
        "rate": 7.0,
        "ref_month": "2026-04",
        "cash": 5000.0,
    }
    r = client.post("/api/settings?owner=Paul", json=payload)
    assert r.status_code == 200
    assert r.json()["ok"] is True

    data = client.get("/api/settings?owner=Paul").json()
    assert data["goal"] == 500000
    assert data["sp0"] == pytest.approx(1200.0)
    assert data["cash"] == pytest.approx(5000.0)


def test_post_partial_update_persists(client):
    """Posting a partial dict still saves the fields present."""
    client.post("/api/settings?owner=Paul", json={"goal": 250000, "rate": 5.5, "cash": 0, "ref_month": "2026-04"})
    data = client.get("/api/settings?owner=Paul").json()
    assert data["goal"] == 250000
    assert data["rate"] == pytest.approx(5.5)


def test_post_gemeinsam_is_noop(client):
    """POST with owner=Gemeinsam must return ok but not raise."""
    r = client.post("/api/settings?owner=Gemeinsam", json={"goal": 999999})
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ── Gemeinsam combined savings rates ─────────────────────────────────────────

def test_gemeinsam_savings_rates_are_summed(client):
    """Gemeinsam sp0–sp3 = Paul's + Lena's."""
    client.post("/api/settings?owner=Paul", json={
        "sp0": 1000.0, "sp1": 500.0, "sp2": 1500.0, "sp3": 300.0,
        "goal": 200000, "rate": 6.0, "cash": 0, "ref_month": "2026-04",
    })
    client.post("/api/settings?owner=Lena", json={
        "sp0": 200.0, "sp1": 100.0, "sp2": 400.0, "sp3": 100.0,
        "goal": 100000, "rate": 5.0, "cash": 0, "ref_month": "2026-04",
    })

    g = client.get("/api/settings?owner=Gemeinsam").json()
    assert g["sp0"] == pytest.approx(1200.0)
    assert g["sp1"] == pytest.approx(600.0)
    assert g["sp2"] == pytest.approx(1900.0)
    assert g["sp3"] == pytest.approx(400.0)


def test_gemeinsam_goal_is_summed(client):
    """Gemeinsam goal = Paul's + Lena's."""
    client.post("/api/settings?owner=Paul", json={
        "goal": 300000, "rate": 6.0, "cash": 0,
        "sp0": 0, "sp1": 0, "sp2": 0, "sp3": 0, "ref_month": "2026-04",
    })
    client.post("/api/settings?owner=Lena", json={
        "goal": 100000, "rate": 5.0, "cash": 0,
        "sp0": 0, "sp1": 0, "sp2": 0, "sp3": 0, "ref_month": "2026-04",
    })
    g = client.get("/api/settings?owner=Gemeinsam").json()
    assert g["goal"] == pytest.approx(400000)


# ── Shared date field sync ────────────────────────────────────────────────────

def test_shared_date_field_syncs_to_lena(client):
    """When Paul saves phase0_end, Lena's settings must reflect the same value."""
    # First give Lena some settings
    client.post("/api/settings?owner=Lena", json={
        "goal": 100000, "rate": 5.0, "cash": 0,
        "sp0": 0, "sp1": 0, "sp2": 0, "sp3": 0,
        "ref_month": "2026-04",
        "phase0_end": "2026-06",
    })

    # Paul sets a different phase0_end
    client.post("/api/settings?owner=Paul", json={
        "goal": 200000, "rate": 6.5, "cash": 0,
        "sp0": 1000, "sp1": 500, "sp2": 1500, "sp3": 300,
        "ref_month": "2026-04",
        "phase0_end": "2027-01",
    })

    lena = client.get("/api/settings?owner=Lena").json()
    assert lena.get("phase0_end") == "2027-01"


def test_shared_date_field_syncs_to_paul(client):
    """When Lena saves ref_month, Paul's settings must pick it up too."""
    client.post("/api/settings?owner=Paul", json={
        "goal": 200000, "rate": 6.5, "cash": 0,
        "sp0": 1000, "sp1": 500, "sp2": 1500, "sp3": 300,
        "ref_month": "2026-04",
    })

    client.post("/api/settings?owner=Lena", json={
        "goal": 100000, "rate": 5.0, "cash": 0,
        "sp0": 0, "sp1": 0, "sp2": 0, "sp3": 0,
        "ref_month": "2026-06",
    })

    paul = client.get("/api/settings?owner=Paul").json()
    assert paul.get("ref_month") == "2026-06"
