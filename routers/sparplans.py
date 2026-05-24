from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import sqlite3

import database
import calculations

router = APIRouter(prefix="/api/sparplans", tags=["sparplans"])


class SparplanIn(BaseModel):
    position_id: int
    monthly_amount: float
    execution_day: int = 1
    started_at: Optional[str] = None
    notes: Optional[str] = None


class SparplanExecuteIn(BaseModel):
    date: str
    price: float
    units: Optional[float] = None


class SparplanUpdate(BaseModel):
    monthly_amount: Optional[float] = None
    execution_day: Optional[int] = None
    started_at: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
def list_sparplans(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    sparplans = database.get_sparplans(db, owner=owner)
    total = sum(s["monthly_amount"] for s in sparplans)
    return {"sparplans": sparplans, "monthly_total": round(total, 2)}


@router.post("")
def add_sparplan(
    data: SparplanIn,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    pos = database.get_position(db, data.position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    sp_id = database.create_sparplan(db, data.model_dump(), owner=owner)
    return {"id": sp_id}


@router.put("/{sp_id}")
def edit_sparplan(sp_id: int, data: SparplanUpdate, db: sqlite3.Connection = Depends(database.get_db)):
    sp = database.get_sparplan(db, sp_id)
    if not sp:
        raise HTTPException(status_code=404, detail="Sparplan nicht gefunden")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        database.update_sparplan(db, sp_id, update_data)
    return {"ok": True}


@router.post("/{sp_id}/execute")
def execute_sparplan(
    sp_id: int,
    data: SparplanExecuteIn,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    sp = database.get_sparplan(db, sp_id)
    if not sp:
        raise HTTPException(status_code=404, detail="Sparplan nicht gefunden")
    if data.price <= 0:
        raise HTTPException(status_code=400, detail="Kurs muss größer 0 sein")
    units = data.units if data.units and data.units > 0 else round(sp["monthly_amount"] / data.price, 6)
    tx_id = database.add_transaction(
        db, sp["position_id"], owner, data.date, units, data.price, "buy",
        f"Sparplan #{sp_id}",
    )
    return {"ok": True, "tx_id": tx_id, "units": units, "invested": round(units * data.price, 2)}


@router.delete("/{sp_id}")
def remove_sparplan(sp_id: int, db: sqlite3.Connection = Depends(database.get_db)):
    sp = database.get_sparplan(db, sp_id)
    if not sp:
        raise HTTPException(status_code=404, detail="Sparplan nicht gefunden")
    database.deactivate_sparplan(db, sp_id)
    return {"ok": True}
