from datetime import date
import pytest
from calculations import (
    ph3_boundary,
    savings_for_month,
    calc_projection,
    portfolio_value,
    simple_return,
    rebalancing_hints,
    baseline_delta,
    house_countdown,
    get_phase_annotations,
)


def test_ph3_boundary(phases):
    # 6 + 12 + 66 = 84; last phase starts at month 85
    assert ph3_boundary(phases) == 84


def test_ph3_boundary_single_phase():
    phases = [{"phase_index": 0, "name": "", "duration_months": None, "monthly_savings": 500}]
    assert ph3_boundary(phases) == 0


def test_savings_for_month_phase0(phases):
    assert savings_for_month(1, phases) == 1000.0
    assert savings_for_month(6, phases) == 1000.0


def test_savings_for_month_phase1(phases):
    assert savings_for_month(7, phases) == 800.0
    assert savings_for_month(18, phases) == 800.0


def test_savings_for_month_phase2(phases):
    assert savings_for_month(19, phases) == 1500.0


def test_savings_for_month_phase3(phases):
    assert savings_for_month(85, phases) == 500.0


def test_savings_empty_phases():
    assert savings_for_month(1, []) == 0.0


def test_calc_projection_starts_at_zero(settings, phases):
    proj = calc_projection(settings, phases, 50000)
    assert proj[0] == {"year": 0, "month": 0, "total": 50000.0, "paid": 50000.0}


def test_calc_projection_grows(settings, phases):
    proj = calc_projection(settings, phases, 50000)
    assert proj[-1]["total"] > 50000


def test_calc_projection_yearly_entries(settings, phases):
    proj = calc_projection(settings, phases, 0)
    assert proj[1]["year"] == 1
    assert proj[2]["year"] == 2


def test_calc_projection_rate_override(settings, phases):
    low  = calc_projection(settings, phases, 10000, rate_override=3)
    high = calc_projection(settings, phases, 10000, rate_override=10)
    assert high[5]["total"] > low[5]["total"]


def test_get_phase_annotations_empty():
    assert get_phase_annotations([]) == []
    single = [{"phase_index": 0, "name": "Only", "duration_months": None, "monthly_savings": 500}]
    assert get_phase_annotations(single) == []


def test_get_phase_annotations_labels(phases):
    anns = get_phase_annotations(phases)
    assert len(anns) == 3  # 4 phases → 3 boundaries
    assert anns[0]["month"] == 6
    assert anns[1]["month"] == 18
    assert anns[2]["month"] == 84


def test_portfolio_value_cash():
    positions = [{"id": 1, "asset_class": "cash", "units": 1, "avg_buy_price": 5000}]
    assert portfolio_value(positions, {}) == 5000.0


def test_portfolio_value_with_price():
    positions = [{"id": 1, "asset_class": "etf", "units": 10, "avg_buy_price": 100}]
    prices = {1: {"price": 120}}
    assert portfolio_value(positions, prices) == 1200.0


def test_portfolio_value_fallback():
    positions = [{"id": 1, "asset_class": "etf", "units": 10, "avg_buy_price": 100}]
    assert portfolio_value(positions, {}) == 1000.0


def test_simple_return_positive():
    result = simple_return(10, 100, 120)
    assert result == 20.0


def test_simple_return_negative():
    result = simple_return(10, 100, 80)
    assert result == -20.0


def test_simple_return_zero_price():
    assert simple_return(0, 100, 120) == 0.0
    assert simple_return(10, 0, 120) == 0.0


def test_rebalancing_hints_overweight():
    positions = [
        {"id": 1, "name": "A", "asset_class": "etf", "units": 80, "avg_buy_price": 100, "target_weight": 50},
        {"id": 2, "name": "B", "asset_class": "etf", "units": 20, "avg_buy_price": 100, "target_weight": 50},
    ]
    prices = {1: {"price": 100}, 2: {"price": 100}}
    hints = rebalancing_hints(positions, prices)
    a = next(h for h in hints if h["id"] == 1)
    b = next(h for h in hints if h["id"] == 2)
    assert a["action"] == "übergewichtet"
    assert b["action"] == "untergewichtet"


def test_rebalancing_hints_ok():
    positions = [
        {"id": 1, "name": "A", "asset_class": "etf", "units": 50, "avg_buy_price": 100, "target_weight": 50},
        {"id": 2, "name": "B", "asset_class": "etf", "units": 50, "avg_buy_price": 100, "target_weight": 50},
    ]
    prices = {1: {"price": 100}, 2: {"price": 100}}
    hints = rebalancing_hints(positions, prices)
    assert all(h["action"] == "ok" for h in hints)


def test_baseline_delta_ahead(settings, phases):
    proj = calc_projection(settings, phases, 50000)
    baseline = {"projection": proj}
    ref_month = settings["ref_month"]
    result = baseline_delta(baseline, ref_month, 55000, as_of=date(2026, 4, 1))
    assert result is not None
    assert result["planned"] == 50000.0
    assert result["delta"] == 5000.0


def test_baseline_delta_none_for_empty():
    assert baseline_delta({}, "2026-04", 50000) is None
    assert baseline_delta(None, "2026-04", 50000) is None


def test_house_countdown_on_track(settings, phases):
    result = house_countdown(settings, phases, 250000)
    assert result["current_total"] == 250000.0
    assert result["goal"] == settings["goal"]
    assert result["gap"] == max(settings["goal"] - 250000, 0)
