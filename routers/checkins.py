from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import sqlite3
from datetime import date

import database
import calculations

router = APIRouter(prefix="/api/checkins", tags=["checkins"])


class CheckinIn(BaseModel):
    date: str
    invested: float
    cash: float
    note: Optional[str] = None


@router.get("")
def list_checkins(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_checkins(db, owner=owner)


@router.get("/{date_str}")
def get_checkin(date_str: str, owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    checkin = database.get_checkin(db, date_str, owner=owner)
    if not checkin:
        raise HTTPException(status_code=404, detail="Kein Check-in für dieses Datum")
    return checkin


@router.post("")
def upsert_checkin(
    data: CheckinIn,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    database.upsert_checkin(db, data.date, data.invested, data.cash, data.note, owner=owner)
    database.log_import(db, "manual", 1, data.date)
    return {"ok": True, "date": data.date}


@router.post("/auto")
def auto_checkin(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    user = database.get_user(db, owner)
    if user and user["is_aggregate"]:
        raise HTTPException(status_code=400, detail="Auto-Checkin nicht für kombinierte Ansicht verfügbar")

    positions = database.get_positions(db, owner=owner)
    latest_prices = database.get_latest_prices(db)
    settings = database.get_settings(db, owner)

    non_cash = [p for p in positions if p.get("asset_class") != "cash"]
    invested = calculations.portfolio_value(non_cash, latest_prices)
    cash = settings.get("cash", 0)

    date_str = date.today().strftime("%Y-%m-%d")
    database.upsert_checkin(db, date_str, invested, cash, "Auto-Checkin", owner=owner)
    database.log_import(db, "auto", 1, date_str)

    return {"ok": True, "date": date_str, "invested": round(invested, 2), "cash": cash}


@router.delete("/{date_str}")
def delete_checkin(
    date_str: str,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    checkin = database.get_checkin(db, date_str, owner=owner)
    if not checkin:
        raise HTTPException(status_code=404, detail="Kein Check-in für dieses Datum")
    database.delete_checkin(db, date_str, owner=owner)
    return {"ok": True}
