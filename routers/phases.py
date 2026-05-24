from typing import List

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
import sqlite3

import database

router = APIRouter(prefix="/api/phases", tags=["phases"])


class PhaseIn(BaseModel):
    name: str = ""
    duration_months: int | None = None
    monthly_savings: float = 0.0


@router.get("")
def list_phases(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    user = database.get_user(db, owner)
    if user and user["is_aggregate"]:
        return database.get_phases_gemeinsam(db)
    return database.get_phases(db, owner)


@router.post("")
def set_phases(
    body: List[PhaseIn],
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    user = database.get_user(db, owner)
    if user and user["is_aggregate"]:
        raise HTTPException(status_code=400, detail="Cannot set phases for aggregate user")
    if len(body) < 1 or len(body) > 4:
        raise HTTPException(status_code=400, detail="phases must have 1–4 entries")
    phases = [p.model_dump() for p in body]
    # Ensure only the last phase has duration_months=None
    for i, ph in enumerate(phases[:-1]):
        if ph["duration_months"] is None or ph["duration_months"] <= 0:
            raise HTTPException(status_code=400, detail=f"Phase {i} must have a positive duration_months")
    phases[-1]["duration_months"] = None
    database.save_phases(db, owner, phases)
    return {"ok": True}
