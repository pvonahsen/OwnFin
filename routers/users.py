import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import database

router = APIRouter(prefix="/api/users", tags=["users"])


class UserIn(BaseModel):
    id: str
    display_name: str
    color: str = "#6366f1"
    is_aggregate: bool = False
    member_ids: list[str] = []


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    color: Optional[str] = None
    member_ids: Optional[list[str]] = None


@router.get("")
def list_users(db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_users(db)


@router.get("/setup-status")
def setup_status(db: sqlite3.Connection = Depends(database.get_db)):
    return {"needs_setup": database.needs_setup(db)}


@router.post("", status_code=201)
def create_user(data: UserIn, db: sqlite3.Connection = Depends(database.get_db)):
    if database.get_user(db, data.id):
        raise HTTPException(status_code=409, detail="User already exists")
    return database.create_user(
        db,
        user_id=data.id,
        display_name=data.display_name,
        color=data.color,
        is_aggregate=data.is_aggregate,
        member_ids=data.member_ids or None,
    )


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    data: UserUpdate,
    db: sqlite3.Connection = Depends(database.get_db),
):
    if not database.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return database.update_user(db, user_id, data.model_dump(exclude_none=True))


@router.delete("/{user_id}")
def delete_user(user_id: str, db: sqlite3.Connection = Depends(database.get_db)):
    if not database.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    database.delete_user(db, user_id)
    return {"ok": True}
