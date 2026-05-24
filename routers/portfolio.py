import calendar
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
import sqlite3

import database
import calculations

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def _summary_for_owner(owner: str, db: sqlite3.Connection) -> dict:
    positions = database.get_positions(db, owner=owner)
    latest_prices = database.get_latest_prices(db)
    user = database.get_user(db, owner)
    settings = (
        database.get_settings_gemeinsam(db)
        if (user and user["is_aggregate"])
        else database.get_settings(db, owner)
    )

    # Separate invest positions from cash positions
    non_cash = [p for p in positions if p.get("asset_class") != "cash"]
    total_value = calculations.portfolio_value(non_cash, latest_prices)

    broker_cash_total = database.get_broker_cash_total(db, owner)
    cash_value = round(
        broker_cash_total if broker_cash_total is not None else settings.get("cash", 0),
        2,
    )

    total_invested = sum(p["units"] * p["avg_buy_price"] for p in non_cash)
    total_gain = total_value - total_invested
    total_return_pct = round((total_gain / total_invested * 100), 2) if total_invested > 0 else 0.0

    position_values = {}
    for pos in positions:
        if pos["asset_class"] == "cash":
            val = pos["units"] * pos["avg_buy_price"]
        elif pos["id"] in latest_prices:
            val = pos["units"] * latest_prices[pos["id"]]["price"]
        else:
            val = pos["units"] * pos["avg_buy_price"]
        position_values[str(pos["id"])] = round(val, 2)

    phases = (
        database.get_phases_gemeinsam(db)
        if (user and user["is_aggregate"])
        else database.get_phases(db, owner)
    )

    rebalancing = calculations.rebalancing_hints(positions, latest_prices)
    countdown = calculations.house_countdown(settings, phases, total_value)

    sparplans = database.get_sparplans(db, owner=owner)
    monthly_savings = sum(s["monthly_amount"] for s in sparplans)

    # Baseline delta
    baseline = database.get_baseline(db, owner)
    ref_month = settings.get("ref_month", "")
    baseline_delta = calculations.baseline_delta(baseline, ref_month, total_value) if baseline else None

    return {
        "total_value": round(total_value, 2),
        "cash_value": cash_value,
        "total_invested": round(total_invested, 2),
        "total_gain": round(total_gain, 2),
        "total_return_pct": total_return_pct,
        "position_values": position_values,
        "rebalancing": rebalancing,
        "countdown": countdown,
        "monthly_savings": round(monthly_savings, 2),
        "baseline_delta": baseline_delta,
    }


@router.get("/summary")
def portfolio_summary(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    return _summary_for_owner(owner, db)


@router.get("/broker_cash")
def broker_cash_summary(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    entries = database.get_broker_cash(db, owner)
    total = sum(e["balance"] for e in entries)
    return {"entries": entries, "total": round(total, 2)}


@router.get("/benchmark")
def portfolio_benchmark(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    import market as market_mod
    transactions = database.get_transactions(db, owner=owner)
    if not transactions:
        return {"benchmark_cagr_pct": None, "benchmark_irr_pct": None, "note": "Keine Transaktionen"}

    # Exclude Anfangsbestand for since_date (but include all txns for IRR)
    real_txns = [t for t in transactions if t.get("notes") != "Anfangsbestand"]
    since_date = min((t["date"] for t in (real_txns or transactions)), default=None)
    if not since_date:
        return {"benchmark_cagr_pct": None, "benchmark_irr_pct": None}
    if len(since_date) == 7:
        since_date += "-01"

    cagr = market_mod.fetch_benchmark_cagr(since_date)
    ticker_used = market_mod._benchmark_cache.get(f"IWDA.AS:{since_date}", {}).get("benchmark_ticker", "IWDA.AS")

    # Period check: IRR is not meaningful for < 36 months
    from datetime import date as _date, datetime as _datetime
    first_date = _datetime.strptime(since_date, "%Y-%m-%d").date()
    span_months = (_date.today().year - first_date.year) * 12 + (_date.today().month - first_date.month)
    irr_too_short = span_months < 36

    benchmark_irr = None
    irr_note = None
    if irr_too_short:
        irr_note = f"Zu wenig Historie für IRR ({span_months} Monate, min. 3 Jahre)"
    else:
        irr_result = market_mod.fetch_benchmark_irr(real_txns or transactions)
        benchmark_irr = irr_result["irr_pct"] if irr_result else None
        if irr_result:
            ticker_used = irr_result["ticker"]

    return {
        "benchmark_cagr_pct": cagr,
        "benchmark_irr_pct": benchmark_irr,
        "benchmark_irr_note": irr_note,
        "since_date": since_date,
        "ticker": ticker_used,
    }


@router.get("/performance")
def portfolio_performance(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    from datetime import date as date_cls
    positions = database.get_positions(db, owner=owner)
    latest_prices = database.get_latest_prices(db)
    transactions = database.get_transactions(db, owner=owner)

    non_cash = [p for p in positions if p.get("asset_class") != "cash"]
    current_value = calculations.portfolio_value(non_cash, latest_prices)

    if not transactions:
        return {"irr_pct": None, "current_value": round(current_value, 2), "tx_count": 0}

    today = date_cls.today()
    first_date = date_cls.fromisoformat(min(tx["date"][:10] for tx in transactions))
    span_months = (today.year - first_date.year) * 12 + (today.month - first_date.month)

    if span_months < 36:
        return {
            "irr_pct": None,
            "irr_note": f"Zu wenig Historie für aussagekräftigen IRR (min. 3 Jahre, aktuell {span_months} Monate)",
            "current_value": round(current_value, 2),
            "tx_count": len(transactions),
        }

    cashflows = []
    for tx in transactions:
        if tx.get("type") in ("dividend", "dividend_reinvested"):
            continue
        date_str = tx["date"] if len(tx["date"]) == 10 else tx["date"][:7] + "-01"
        if tx["units"] > 0:
            cashflows.append((date_str, -abs(tx["units"] * tx["price"])))
        else:
            cashflows.append((date_str, abs(tx["units"] * tx["price"])))

    cashflows.append((str(today), current_value))

    irr = calculations.xirr(cashflows)
    return {
        "irr_pct": irr,
        "current_value": round(current_value, 2),
        "tx_count": len(transactions),
    }


@router.get("/history")
def portfolio_history(
    days: int = 365,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    positions = database.get_positions(db, owner=owner)
    start = str(date.today() - timedelta(days=days))

    # All transactions first — needed to decide which no-ticker positions have txns
    all_txns = sorted(database.get_transactions(db, owner=owner), key=lambda t: t["date"])
    txn_pos_ids = {tx["position_id"] for tx in all_txns}

    # No-ticker non-cash positions: value computed at avg_buy_price (cost basis, no market price)
    no_ticker_cost: dict = {
        p["id"]: p.get("avg_buy_price", 0.0)
        for p in positions
        if not p.get("ticker") and p.get("asset_class") != "cash"
    }

    # Only positions WITH tickers go into the price-history query
    priced_ids = [p["id"] for p in positions if p.get("asset_class") != "cash" and p.get("ticker")]

    # Cash positions + no-ticker positions WITHOUT transactions → constant base value
    static_base = sum(
        p["units"] * p["avg_buy_price"]
        for p in positions
        if p.get("asset_class") == "cash"
    ) + sum(
        p.get("units", 0) * p.get("avg_buy_price", 0.0)
        for p in positions
        if p["id"] in no_ticker_cost and p["id"] not in txn_pos_ids
    )

    if not priced_ids and not (no_ticker_cost and txn_pos_ids):
        return []

    prices_by_date: dict = defaultdict(dict)
    if priced_ids:
        placeholders = ",".join("?" * len(priced_ids))
        rows = db.execute(
            f"SELECT position_id, date, price FROM prices "
            f"WHERE date >= ? AND position_id IN ({placeholders}) ORDER BY date",
            [start] + priced_ids,
        ).fetchall()
        for row in rows:
            prices_by_date[row["date"]][row["position_id"]] = row["price"]

    all_dates = sorted(prices_by_date.keys())
    if not all_dates:
        return []

    tx_idx = 0
    units_held: dict = defaultdict(float)
    last_prices: dict = {}  # carry-forward last known price per priced position
    total_invested = 0.0

    result = []
    for date_str in all_dates:
        # Advance transactions up to and including this date
        while tx_idx < len(all_txns) and all_txns[tx_idx]["date"] <= date_str:
            tx = all_txns[tx_idx]
            units_held[tx["position_id"]] += tx["units"]
            total_invested += tx["units"] * tx["price"]
            tx_idx += 1

        # Update carry-forward price cache (priced positions only)
        for pos_id, price in prices_by_date[date_str].items():
            last_prices[pos_id] = price

        portfolio_value = static_base
        for pos_id, units in units_held.items():
            if units <= 0:
                continue
            if pos_id in no_ticker_cost:
                # No-ticker position with transactions: use cost basis
                portfolio_value += units * no_ticker_cost[pos_id]
            else:
                price = last_prices.get(pos_id)
                if price:
                    portfolio_value += units * price

        result.append({
            "date": date_str,
            "total": round(portfolio_value, 2),
            "invested": round(total_invested, 2),
        })

    return result


@router.get("/msci-world-simulation")
def msci_world_simulation(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    import yfinance as yf
    transactions = database.get_transactions(db, owner=owner)
    buy_txns = sorted(
        [t for t in transactions if (t.get("units") or 0) > 0],
        key=lambda t: t["date"],
    )
    if not buy_txns:
        return []
    first_date = buy_txns[0]["date"][:10]
    try:
        hist = yf.Ticker("IWDA.AS").history(start=first_date, auto_adjust=True)
        if hist.empty:
            return []
        iwda_prices = {str(idx.date()): float(row["Close"]) for idx, row in hist.iterrows()}
    except Exception:
        return []

    sorted_dates = sorted(iwda_prices.keys())

    def price_on_or_before(d):
        result = None
        for sd in sorted_dates:
            if sd <= d:
                result = iwda_prices[sd]
            else:
                break
        return result

    events = []
    for tx in buy_txns:
        invested = (tx.get("units") or 0) * (tx.get("price") or 0)
        buy_date = tx["date"][:10]
        p = price_on_or_before(buy_date)
        if p and p > 0:
            events.append({"date": buy_date, "units": invested / p})

    if not events:
        return []

    ev_idx = 0
    cumulative_units = 0.0
    result = []
    for date_str in sorted_dates:
        while ev_idx < len(events) and events[ev_idx]["date"] <= date_str:
            cumulative_units += events[ev_idx]["units"]
            ev_idx += 1
        if cumulative_units > 0:
            result.append({"date": date_str, "total": round(cumulative_units * iwda_prices[date_str], 2)})
    return result


@router.get("/monthly-review")
def monthly_review(
    month: str = Query(...),
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    y, m = map(int, month.split("-"))
    last_day = calendar.monthrange(y, m)[1]
    from_date = f"{month}-01"
    to_date = f"{month}-{last_day:02d}"

    # Check-in data for the month
    checkins = database.get_checkins(db, owner=owner)
    month_checkins = [c for c in checkins if c["date"].startswith(month)]
    all_sorted = sorted(checkins, key=lambda c: c["date"])

    # Portfolio value: use check-ins bracketing the month
    prev_checkins = [c for c in all_sorted if c["date"] < from_date]
    in_or_prev = prev_checkins + month_checkins
    start_val = (in_or_prev[-1]["invested"] if in_or_prev else None) if not month_checkins else (month_checkins[0]["invested"])
    end_val = month_checkins[-1]["invested"] if month_checkins else None

    # Transactions in the month
    txns = database.get_transactions(db, owner=owner)
    month_txns = [t for t in txns if (t["date"] or "").startswith(month)]
    contributions = round(sum(
        t["units"] * t["price"]
        for t in month_txns
        if t.get("units", 0) > 0 and t.get("type") not in ("dividend", "dividend_reinvested")
    ), 2)

    value_change = round(end_val - start_val, 2) if (start_val is not None and end_val is not None) else None
    return_eur = round(value_change - contributions, 2) if value_change is not None else None
    return_pct = round(return_eur / start_val * 100, 2) if (return_eur is not None and start_val and start_val > 0) else None

    # Best/worst position from prices table
    positions = database.get_positions(db, owner=owner)
    non_cash = [p for p in positions if p.get("asset_class") != "cash" and p.get("ticker")]
    pos_changes = []
    for pos in non_cash:
        p_start = db.execute(
            "SELECT price FROM prices WHERE position_id=? AND date<=? ORDER BY date DESC LIMIT 1",
            (pos["id"], from_date),
        ).fetchone()
        p_end = db.execute(
            "SELECT price FROM prices WHERE position_id=? AND date<=? ORDER BY date DESC LIMIT 1",
            (pos["id"], to_date),
        ).fetchone()
        if p_start and p_end and p_start["price"] > 0:
            chg = round((p_end["price"] - p_start["price"]) / p_start["price"] * 100, 2)
            pos_changes.append({"name": pos["name"], "ticker": pos["ticker"], "change_pct": chg})
    pos_changes.sort(key=lambda x: x["change_pct"])
    worst = pos_changes[0] if pos_changes else None
    best = pos_changes[-1] if pos_changes else None

    # Giro summary — mirrors frontend bucketsForRange logic
    giro_income, giro_expenses = 0.0, 0.0
    giro_big4 = None
    savings_rate = None
    try:
        cats = database.get_bank_categories(db)
        cat_bucket = {c["name"]: c.get("bucket") or "guilt" for c in cats}
        income_cats = {c["name"] for c in cats if c.get("type") == "income"}

        # Non-transfer transactions: income-typed positives vs expense-typed negatives
        bank_txns = database.get_bank_transactions(
            db, owner=owner, from_date=from_date, to_date=to_date, include_transfers=False, limit=9999
        )
        cat_amounts: dict = {}
        for tx in bank_txns:
            cat = tx.get("custom_category") or tx.get("original_category") or ""
            amt = tx["amount"]
            if cat in income_cats:
                if amt > 0:
                    giro_income += amt
            else:
                cat_amounts[cat] = cat_amounts.get(cat, 0.0) + amt

        bucket_spend: dict = {"fix": 0.0, "invest": 0.0, "goals": 0.0, "guilt": 0.0}
        total_spend = 0.0
        for cat, net in cat_amounts.items():
            if net < 0:
                bk = cat_bucket.get(cat, "guilt")
                bucket_spend[bk] += abs(net)
                total_spend += abs(net)
                giro_expenses += abs(net)

        # Outgoing savings transfers (pocket → invest/goals) count as savings
        savings_transfers = 0.0
        all_txns = database.get_bank_transactions(
            db, owner=owner, from_date=from_date, to_date=to_date, include_transfers=True, limit=9999
        )
        for tx in all_txns:
            if tx.get("is_transfer") and tx["amount"] < 0:
                cat = tx.get("custom_category") or tx.get("original_category") or ""
                bk = cat_bucket.get(cat, "guilt")
                if bk in ("invest", "goals"):
                    savings_transfers += abs(tx["amount"])
                    bucket_spend[bk] += abs(tx["amount"])
                    total_spend += abs(tx["amount"])

        giro_big4 = {
            bk: {"amount": round(amt, 2), "pct": round(amt / total_spend * 100, 1) if total_spend > 0 else 0.0}
            for bk, amt in bucket_spend.items()
        }
        giro_big4["total_spend"] = round(total_spend, 2)

        savings = bucket_spend["invest"] + bucket_spend["goals"]
        savings_rate = round(savings / giro_income * 100, 1) if giro_income > 0 else None
    except Exception:
        pass

    return {
        "month": month,
        "portfolio_start": round(start_val, 2) if start_val is not None else None,
        "portfolio_end": round(end_val, 2) if end_val is not None else None,
        "value_change": value_change,
        "contributions": contributions,
        "return_eur": return_eur,
        "return_pct": return_pct,
        "checkin_count": len(month_checkins),
        "best_position": best,
        "worst_position": worst,
        "giro_income": round(giro_income, 2),
        "giro_expenses": round(giro_expenses, 2),
        "savings_rate": savings_rate,
        "giro_big4": giro_big4,
    }
