from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import sqlite3

import database
import calculations
from isin_lookup import lookup_ticker

router = APIRouter(prefix="/api/positions", tags=["positions"])


class PositionIn(BaseModel):
    name: str
    ticker: Optional[str] = None
    isin: Optional[str] = None
    units: float = 0
    avg_buy_price: float = 0
    monthly_rate: float = 0
    target_weight: float = 0
    asset_class: str = "etf"
    notes: Optional[str] = None


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    ticker: Optional[str] = None
    isin: Optional[str] = None
    units: Optional[float] = None
    avg_buy_price: Optional[float] = None
    monthly_rate: Optional[float] = None
    target_weight: Optional[float] = None
    asset_class: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
def list_positions(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    positions = database.get_positions(db, owner=owner)
    latest_prices = database.get_latest_prices(db)

    result = []
    for pos in positions:
        p = dict(pos)
        if pos["asset_class"] == "cash":
            p["current_price"] = pos["avg_buy_price"]
            p["current_value"] = round(pos["units"] * pos["avg_buy_price"], 2)
            p["return_pct"] = 0.0
            p["price_date"] = None
        elif pos["id"] in latest_prices:
            info = latest_prices[pos["id"]]
            p["current_price"] = info["price"]
            p["current_value"] = round(pos["units"] * info["price"], 2)
            p["return_pct"] = calculations.simple_return(pos["units"], pos["avg_buy_price"], info["price"])
            p["price_date"] = info["date"]
        else:
            p["current_price"] = None
            p["current_value"] = round(pos["units"] * pos["avg_buy_price"], 2)
            p["return_pct"] = 0.0
            p["price_date"] = None
        result.append(p)
    return result


@router.post("")
def add_position(
    data: PositionIn,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    pos_data = data.model_dump()
    # Auto-lookup ticker from ISIN when ticker is absent or empty
    if pos_data.get("isin") and not pos_data.get("ticker"):
        resolved = lookup_ticker(pos_data["isin"])
        if resolved:
            pos_data["ticker"] = resolved
    pos_id = database.create_position(db, pos_data, owner=owner)
    return {"id": pos_id}


@router.put("/{pos_id}")
def edit_position(pos_id: int, data: PositionUpdate, db: sqlite3.Connection = Depends(database.get_db)):
    pos = database.get_position(db, pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        database.update_position(db, pos_id, update_data)
    return {"ok": True}


@router.delete("/{pos_id}")
def remove_position(pos_id: int, db: sqlite3.Connection = Depends(database.get_db)):
    pos = database.get_position(db, pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    database.deactivate_position(db, pos_id)
    return {"ok": True}


@router.get("/{pos_id}/history")
def price_history(pos_id: int, db: sqlite3.Connection = Depends(database.get_db)):
    pos = database.get_position(db, pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    return database.get_price_history(db, pos_id)


@router.get("/{pos_id}/performance")
def position_performance(pos_id: int, db: sqlite3.Connection = Depends(database.get_db)):
    pos = database.get_position(db, pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")

    latest_prices = database.get_latest_prices(db)
    dividends = database.get_dividends(db, pos_id)

    current_price = latest_prices.get(pos_id, {}).get("price") if pos_id in latest_prices else None
    if pos["asset_class"] == "cash":
        current_price = pos["avg_buy_price"]

    invested = pos["units"] * pos["avg_buy_price"]
    current_value = pos["units"] * (current_price or pos["avg_buy_price"])
    ret_pct = calculations.simple_return(pos["units"], pos["avg_buy_price"], current_price or pos["avg_buy_price"])
    total_dividends = sum(d["total_amount"] for d in dividends)

    return {
        "position_id": pos_id,
        "name": pos["name"],
        "invested": round(invested, 2),
        "current_value": round(current_value, 2),
        "gain_loss": round(current_value - invested, 2),
        "return_pct": round(ret_pct, 2),
        "total_dividends": round(total_dividends, 2),
        "dividends": dividends,
    }
