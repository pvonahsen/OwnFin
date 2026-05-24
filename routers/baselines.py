import json

from fastapi import APIRouter, Depends, Query
import sqlite3

import database
import calculations

router = APIRouter(prefix="/api/baselines", tags=["baselines"])


@router.get("")
def get_baseline(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_baseline(db, owner) or {}


@router.post("/fix")
def fix_baseline(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    user = database.get_user(db, owner)
    if user and user.get("is_aggregate"):
        member_ids = user.get("member_ids") or []
        positions = [p for mid in member_ids for p in database.get_positions(db, owner=mid)]
        settings = database.get_settings_gemeinsam(db)
        phases = database.get_phases_gemeinsam(db)
    else:
        positions = database.get_positions(db, owner=owner)
        settings = database.get_settings(db, owner)
        phases = database.get_phases(db, owner)

    prices = database.get_latest_prices(db)
    start_value = calculations.portfolio_value(positions, prices)
    projection = calculations.calc_projection(settings, phases, start_value)

    database.save_baseline(
        db, owner, settings.get("ref_month", ""), start_value, json.dumps(projection)
    )
    return {"ok": True, "start_value": round(start_value, 2), "points": len(projection)}
