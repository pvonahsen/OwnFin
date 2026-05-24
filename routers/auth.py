from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import sqlite3

import database

router = APIRouter(prefix="/api/auth", tags=["auth"])


class VerifyIn(BaseModel):
    owner: str
    password: str


@router.get("/has-password")
def has_password(owner: str = Query(...), db: sqlite3.Connection = Depends(database.get_db)):
    if owner == "Gemeinsam":
        return {"has_password": False}
    settings = database.get_settings(db, owner)
    return {"has_password": bool(settings.get("password", ""))}


@router.post("/verify")
def verify(data: VerifyIn, db: sqlite3.Connection = Depends(database.get_db)):
    if data.owner == "Gemeinsam":
        return {"ok": True}
    settings = database.get_settings(db, data.owner)
    stored = settings.get("password", "")
    if not stored:
        return {"ok": True}
    if stored != data.password:
        raise HTTPException(status_code=401, detail="Falsches Passwort")
    return {"ok": True}
