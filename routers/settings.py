from typing import Any, Dict

from fastapi import APIRouter, Depends, Query
import sqlite3

import database

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def read_settings(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    user = database.get_user(db, owner)
    if user and user["is_aggregate"]:
        s = database.get_settings_gemeinsam(db)
        phases = database.get_phases_gemeinsam(db)
    else:
        s = database.get_settings(db, owner)
        phases = database.get_phases(db, owner)
    result = {k: v for k, v in s.items() if k != "password"}
    result["phases"] = phases
    return result


@router.post("")
def write_settings(
    data: Dict[str, Any],
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    if owner != "Gemeinsam":
        database.save_settings(db, data, owner)
    return {"ok": True}
