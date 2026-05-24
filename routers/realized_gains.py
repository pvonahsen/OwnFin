from fastapi import APIRouter, Depends, Query
import sqlite3
from datetime import date
from typing import Optional

import database

router = APIRouter(prefix="/api/realized-gains", tags=["realized_gains"])


@router.get("/summary")
def realized_gains_summary(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    """Gesamtsummary realisierter G/V und KESt Belastung."""
    transactions = database.get_transactions(db, owner=owner)
    
    total_gains = 0.0
    total_losses = 0.0
    taxable_gains = 0.0
    
    for tx in transactions:
        # Only sells (negative units), skip dividends
        if tx["units"] >= 0 or tx.get("type") in ("dividend", "dividend_reinvested"):
            continue

        units_sold = abs(tx["units"])
        sell_price = tx["price"]          # what we received per unit
        cost_basis = tx.get("sale_price") # cost basis per unit (captured at time of sell)

        if cost_basis is None:
            continue

        gain_per_unit = sell_price - cost_basis
        total_gain = gain_per_unit * units_sold

        if total_gain >= 0:
            total_gains += total_gain
            taxable_gains += total_gain
        else:
            total_losses += abs(total_gain)
    
    settings = database.get_settings(db, owner)
    kest_rate = settings.get("capital_gains_tax_rate", 0.275)
    kest = round(taxable_gains * kest_rate, 2)
    
    return {
        "total_gains": round(total_gains, 2),
        "total_losses": round(total_losses, 2),
        "net_gain": round(total_gains - total_losses, 2),
        "taxable_gains": round(taxable_gains, 2),
        "kest_rate_pct": kest_rate * 100,
        "kest_amount": kest,
        "net_after_kest": round(total_gains - kest, 2),
    }


@router.get("/by-year")
def realized_gains_by_year(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    """Realisierte G/V gruppiert nach Verkaufsjahr."""
    transactions = database.get_transactions(db, owner=owner)
    
    by_year = {}
    
    for tx in transactions:
        if tx["units"] >= 0 or tx.get("type") in ("dividend", "dividend_reinvested"):
            continue

        cost_basis = tx.get("sale_price")
        if cost_basis is None:
            continue

        year = tx["date"][:4]

        units_sold = abs(tx["units"])
        sell_price = tx["price"]
        gain_per_unit = sell_price - cost_basis
        total_gain = gain_per_unit * units_sold
        
        if year not in by_year:
            by_year[year] = {
                "gains": 0.0,
                "losses": 0.0,
                "transactions": 0,
            }
        
        if total_gain >= 0:
            by_year[year]["gains"] += total_gain
        else:
            by_year[year]["losses"] += abs(total_gain)
        
        by_year[year]["transactions"] += 1
    
    settings = database.get_settings(db, owner)
    kest_rate = settings.get("capital_gains_tax_rate", 0.275)

    result = []
    for year in sorted(by_year.keys(), reverse=True):
        year_data = by_year[year]
        taxable = year_data["gains"]
        kest = round(taxable * kest_rate, 2)
        
        result.append({
            "year": year,
            "gains": round(year_data["gains"], 2),
            "losses": round(year_data["losses"], 2),
            "net": round(year_data["gains"] - year_data["losses"], 2),
            "taxable_gains": round(taxable, 2),
            "kest": kest,
            "net_after_kest": round(year_data["gains"] - kest, 2),
            "transaction_count": year_data["transactions"],
        })
    
    return result


@router.get("/transactions")
def realized_gains_transactions(
    owner: str = Query(...),
    limit: int = Query(100),
    db: sqlite3.Connection = Depends(database.get_db),
):
    """Liste aller Verkäufe mit G/V-Berechnung."""
    transactions = database.get_transactions(db, owner=owner)
    
    sales = []
    for tx in transactions:
        if tx["units"] >= 0 or tx.get("type") in ("dividend", "dividend_reinvested"):
            continue

        cost_basis = tx.get("sale_price")
        if cost_basis is None:
            continue

        position = database.get_position(db, tx["position_id"])
        units_sold = abs(tx["units"])
        sell_price = tx["price"]
        gain_per_unit = sell_price - cost_basis
        total_gain = gain_per_unit * units_sold
        kest = round(max(total_gain, 0) * 0.275, 2)

        sales.append({
            "date": tx["date"],
            "position_name": position["name"] if position else "Unbekannt",
            "position_id": tx["position_id"],
            "units_sold": round(units_sold, 8),
            "cost_per_unit": round(cost_basis, 2),
            "sell_price": round(sell_price, 2),
            "gain_per_unit": round(gain_per_unit, 2),
            "total_gain": round(total_gain, 2),
            "kest": kest,
            "net_gain": round(total_gain - kest, 2),
        })
    
    # Sort by date descending
    sales.sort(key=lambda x: x["date"], reverse=True)
    
    return sales[:limit]


@router.post("/update-sale-price")
def update_sale_price(
    transaction_id: int,
    sale_price: float,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    """Aktualisiere sale_price für einen Verkauf (zur Berechnung von G/V)."""
    db.execute(
        "UPDATE transactions SET sale_price=? WHERE id=? AND owner=?",
        (sale_price, transaction_id, owner),
    )
    db.commit()
    return {"ok": True, "transaction_id": transaction_id, "sale_price": sale_price}
