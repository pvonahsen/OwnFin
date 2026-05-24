from typing import Optional


def portfolio_value(positions: list, latest_prices: dict) -> float:
    total = 0.0
    for pos in positions:
        if pos.get("asset_class") == "cash":
            # Cash: units * avg_buy_price (z.B. 1 * 6000 = 6000 €)
            total += pos.get("units", 0) * pos.get("avg_buy_price", 0)
        elif pos["id"] in latest_prices:
            total += pos.get("units", 0) * latest_prices[pos["id"]]["price"]
        else:
            # Fallback auf Einstandswert wenn kein Kurs vorhanden
            total += pos.get("units", 0) * pos.get("avg_buy_price", 0)
    return round(total, 2)


def simple_return(units: float, avg_buy_price: float, current_price: float) -> float:
    """Einfache Rendite in % gegenüber dem Einstandskurs."""
    if avg_buy_price <= 0 or units <= 0:
        return 0.0
    invested = units * avg_buy_price
    current = units * current_price
    return round((current - invested) / invested * 100, 2)


_PHASE_COLORS = ["#EF9F27", "#378ADD", "#7F77DD", "#E76F51"]


def ph3_boundary(phases: list) -> int:
    """Month index at which the last phase starts (sum of all non-last durations)."""
    total = 0
    for ph in phases:
        dur = ph.get("duration_months")
        if dur is None:
            return total
        total += dur
    return total  # no last-phase found; contributions stay in invested bucket


def savings_for_month(m: int, phases: list) -> float:
    """Monthly savings contribution for month m given an ordered phases list."""
    if not phases:
        return 0.0
    boundary = 0
    for ph in phases:
        dur = ph.get("duration_months")
        if dur is None:
            return ph["monthly_savings"]
        boundary += dur
        if m <= boundary:
            return ph["monthly_savings"]
    return phases[-1]["monthly_savings"]


def calc_projection(settings: dict, phases: list, start_value: float, rate_override: Optional[float] = None) -> list:
    """
    Projektion J0-J12 berechnen mit monatlichem Compounding.
    Ab der letzten Phase gehen neue Sparraten in einen sicheren Bucket (rate_ph3),
    das bestehende Portfolio wächst weiterhin zum ETF-Satz.
    Gibt Jahres-Snapshots zurück: [{year, month, total, paid}]
    """
    annual_rate = (rate_override if rate_override is not None else settings["rate"]) / 100
    monthly_rate = annual_rate / 12
    monthly_rate_ph3 = (settings.get("rate_ph3", 2.5) / 100) / 12

    last_phase_start = ph3_boundary(phases)

    invested_val = start_value
    safe_val = 0.0
    paid = start_value

    results = [{"year": 0, "month": 0, "total": round(start_value, 2), "paid": round(paid, 2)}]

    max_months = max(settings["totalMo"], 156)

    for m in range(1, max_months + 1):
        sparrate = savings_for_month(m, phases)
        if m <= last_phase_start:
            invested_val = invested_val * (1 + monthly_rate) + sparrate
        else:
            invested_val = invested_val * (1 + monthly_rate)
            safe_val = safe_val * (1 + monthly_rate_ph3) + sparrate
        paid += sparrate

        if m % 12 == 0:
            results.append({
                "year": m // 12,
                "month": m,
                "total": round(invested_val + safe_val, 2),
                "paid": round(paid, 2),
            })

    return results


def get_phase_annotations(phases: list) -> list:
    """Phase transition points as chart annotations [{month, year, label, color}]."""
    if len(phases) <= 1:
        return []
    annotations = []
    boundary = 0
    for i, ph in enumerate(phases[:-1]):
        dur = ph.get("duration_months") or 0
        boundary += dur
        next_name = phases[i + 1].get("name") or f"Phase {i + 2}"
        annotations.append({
            "month": boundary,
            "year": round(boundary / 12, 3),
            "label": next_name,
            "color": _PHASE_COLORS[i % len(_PHASE_COLORS)],
        })
    return annotations


def house_countdown(settings: dict, phases: list, current_total: float) -> dict:
    """
    Berechnet wann das Hauskauf-Ziel erreicht wird.
    Vergleicht mit dem geplanten Zeitrahmen (totalMo).
    Ab der letzten Phase gehen neue Sparraten in den sicheren Bucket (rate_ph3).
    """
    goal = settings["goal"]
    total_mo = settings["totalMo"]
    monthly_rate = (settings["rate"] / 100) / 12
    monthly_rate_ph3 = (settings.get("rate_ph3", 2.5) / 100) / 12
    last_phase_start = ph3_boundary(phases)

    invested_val = current_total
    safe_val = 0.0
    target_month = None

    # Bis zu 2x dem Planungshorizont suchen
    for m in range(1, total_mo * 2 + 1):
        sparrate = savings_for_month(m, phases)
        if m <= last_phase_start:
            invested_val = invested_val * (1 + monthly_rate) + sparrate
        else:
            invested_val = invested_val * (1 + monthly_rate)
            safe_val = safe_val * (1 + monthly_rate_ph3) + sparrate
        if invested_val + safe_val >= goal:
            target_month = m
            break

    on_track = target_month is not None and target_month <= total_mo
    months_diff = (total_mo - target_month) if target_month is not None else None

    return {
        "months_remaining": target_month,
        "plan_months": total_mo,
        "current_total": round(current_total, 2),
        "goal": goal,
        "gap": round(max(goal - current_total, 0), 2),
        "on_track": on_track,
        "months_ahead_or_behind": months_diff,
    }


def rebalancing_hints(positions: list, latest_prices: dict) -> list:
    """
    Rebalancing-Empfehlungen je Position.
    Gibt [{id, name, current_weight, target_weight, diff, action, value}] zurück.
    action: 'übergewichtet' | 'untergewichtet' | 'ok' (±2% Toleranz)
    """
    # Gesamtwert berechnen
    position_values = {}
    total = 0.0
    for pos in positions:
        if pos.get("asset_class") == "cash":
            val = pos.get("units", 0) * pos.get("avg_buy_price", 0)
        elif pos["id"] in latest_prices:
            val = pos.get("units", 0) * latest_prices[pos["id"]]["price"]
        else:
            val = pos.get("units", 0) * pos.get("avg_buy_price", 0)
        position_values[pos["id"]] = val
        total += val

    hints = []
    for pos in positions:
        val = position_values[pos["id"]]
        current_weight = (val / total * 100) if total > 0 else 0.0
        target_weight = pos.get("target_weight", 0)
        diff = current_weight - target_weight

        if diff > 2:
            action = "übergewichtet"
        elif diff < -2:
            action = "untergewichtet"
        else:
            action = "ok"

        hints.append({
            "id": pos["id"],
            "name": pos["name"],
            "current_weight": round(current_weight, 2),
            "target_weight": round(target_weight, 2),
            "diff": round(diff, 2),
            "action": action,
            "value": round(val, 2),
        })

    return sorted(hints, key=lambda x: abs(x["diff"]), reverse=True)


def xirr(cashflows: list) -> Optional[float]:
    """
    XIRR: annualisierte interne Rendite aus unregelmäßigen Cashflows.
    cashflows: [(date_str "YYYY-MM-DD", amount)] — negativ = Zahlung, positiv = Einnahme
    Gibt Rendite in % p.a. zurück oder None bei Fehler.
    """
    from datetime import datetime
    if len(cashflows) < 2:
        return None
    try:
        parsed = sorted(cashflows, key=lambda x: x[0])
        t0 = datetime.strptime(parsed[0][0], "%Y-%m-%d")
        years = [(datetime.strptime(d, "%Y-%m-%d") - t0).days / 365.25 for d, _ in parsed]
        amounts = [a for _, a in parsed]

        def npv(r):
            return sum(a / (1 + r) ** t for a, t in zip(amounts, years))

        def dnpv(r):
            return sum(-t * a / (1 + r) ** (t + 1) for a, t in zip(amounts, years))

        for r0 in [0.10, 0.05, 0.20, 0.0, -0.05]:
            r = r0
            for _ in range(200):
                n, dn = npv(r), dnpv(r)
                if abs(dn) < 1e-12:
                    break
                step = n / dn
                r -= step
                r = max(r, -0.99)
                if abs(step) < 1e-8:
                    break
            if -0.99 < r < 50 and abs(npv(r)) < 0.5:
                return round(r * 100, 2)
    except Exception:
        pass
    return None


def baseline_delta(baseline: dict, ref_month: str, current_total: float, as_of=None) -> Optional[dict]:
    """
    Vergleicht aktuellen Portfoliowert mit dem gespeicherten Baseline-Plan.
    ref_month: settings["ref_month"], z.B. "2026-04"
    Gibt {planned, delta, delta_pct} zurück oder None wenn keine Baseline.
    """
    if not baseline or not baseline.get("projection"):
        return None
    from datetime import date as _date
    ry, rm = map(int, ref_month.split("-"))
    now = as_of or _date.today()
    months_elapsed = (now.year - ry) * 12 + (now.month - rm)
    year_elapsed = months_elapsed / 12.0

    proj = baseline["projection"]
    before = next((p for p in reversed(proj) if p["year"] <= year_elapsed), None)
    after = next((p for p in proj if p["year"] > year_elapsed), None)

    if before is None and after is None:
        return None
    if before is None:
        planned = after["total"]
    elif after is None:
        planned = before["total"]
    else:
        t = (year_elapsed - before["year"]) / (after["year"] - before["year"])
        planned = before["total"] + t * (after["total"] - before["total"])

    planned = round(planned, 2)
    delta = round(current_total - planned, 2)
    delta_pct = round(delta / planned * 100, 2) if planned > 0 else 0.0
    return {"planned": planned, "delta": delta, "delta_pct": delta_pct}
