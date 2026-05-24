from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
import sqlite3
from datetime import date

import database
import calculations

router = APIRouter(prefix="/api/import", tags=["import"])


class ManualImport(BaseModel):
    month: Optional[str] = None     # "2026-04", default: aktueller Monat
    invested: float
    cash: float
    note: Optional[str] = None


@router.post("/manual")
def manual_import(data: ManualImport, db: sqlite3.Connection = Depends(database.get_db)):
    month = data.month or date.today().strftime("%Y-%m")
    database.upsert_checkin(db, month, data.invested, data.cash, data.note)
    database.log_import(db, "manual", 1, month)
    return {"ok": True, "month": month}


@router.get("/history")
def import_history(db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_import_history(db)
