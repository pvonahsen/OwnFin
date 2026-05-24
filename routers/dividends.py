from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import sqlite3

import database

router = APIRouter(prefix="/api/dividends", tags=["dividends"])


class DividendIn(BaseModel):
    position_id: int
    date: str
    amount_per_unit: float


@router.get("")
def list_dividends(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    divs = database.get_dividends(db, owner=owner)
    yearly: dict = {}
    for d in divs:
        year = d["date"][:4]
        yearly[year] = round(yearly.get(year, 0) + d["total_amount"], 2)
    return {"dividends": divs, "yearly_totals": yearly}


@router.post("")
def add_dividend(data: DividendIn, db: sqlite3.Connection = Depends(database.get_db)):
    pos = database.get_position(db, data.position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    database.upsert_dividend(db, data.position_id, data.date, data.amount_per_unit, pos["units"])
    return {"ok": True}


@router.delete("/{div_id}")
def remove_dividend(div_id: int, db: sqlite3.Connection = Depends(database.get_db)):
    row = db.execute("SELECT id FROM dividends WHERE id=?", (div_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Dividende nicht gefunden")
    database.delete_dividend(db, div_id)
    return {"ok": True}
