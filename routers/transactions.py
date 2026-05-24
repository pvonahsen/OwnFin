from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
import sqlite3

import database
import importer as csv_importer
from isin_lookup import lookup_ticker

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TransactionIn(BaseModel):
    position_id: int
    date: str           # YYYY-MM-DD
    units: float        # positive = buy, negative = sell
    price: float        # price per unit in EUR
    type: str = "buy"
    notes: Optional[str] = None


@router.get("")
def list_transactions(
    owner: str = Query(...),
    position_id: Optional[int] = Query(None),
    db: sqlite3.Connection = Depends(database.get_db),
):
    return database.get_transactions(db, owner=owner, position_id=position_id)


@router.post("")
def create_transaction(
    data: TransactionIn,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    user = database.get_user(db, owner)
    if user and user["is_aggregate"]:
        raise HTTPException(400, "Cannot add transactions in aggregate view")
    units = data.units if data.type == "buy" else -abs(data.units)
    tx_id = database.add_transaction(
        db, data.position_id, owner, data.date, units, data.price, data.type, data.notes
    )
    return {"ok": True, "id": tx_id}


@router.delete("/{tx_id}")
def remove_transaction(
    tx_id: int,
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    user = database.get_user(db, owner)
    if user and user["is_aggregate"]:
        raise HTTPException(400, "Cannot delete transactions in aggregate view")
    database.delete_transaction(db, tx_id)
    return {"ok": True}


@router.post("/import")
async def import_csv(
    owner: str = Query(...),
    file: UploadFile = File(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    """
    Broker import with auto-detection of format:
    - .xlsx files from the Siemens Employee Share Program
    - CSV: Trade Republic, Flatex, Bitpanda, generic
    Matching by ISIN first, then by position name. Unknown positions are
    created automatically. Duplicate transactions (same position/date/units/price)
    are skipped.
    """
    if owner == "Gemeinsam":
        raise HTTPException(400, "Cannot import transactions in Gemeinsam view")

    content = await file.read()
    positions = database.get_positions(db, active_only=False, owner=owner)

    filename = (file.filename or "").lower()
    # xlsx detection: by extension or by ZIP magic bytes (xlsx is a ZIP archive)
    is_xlsx = filename.endswith(".xlsx") or (
        not filename.endswith(".csv") and content[:4] == b"PK\x03\x04"
    )

    if is_xlsx:
        txns, errors = csv_importer.parse_siemens_xlsx(content, positions)
    else:
        txns, errors = csv_importer.parse_csv(content, positions)

    # Create any new positions that the parser flagged, then patch position_id
    created_positions: dict[str, int] = {}  # key: "name||isin" → new id
    for tx in txns:
        if not tx.get("needs_create"):
            continue
        pos_name = tx["pos_name"] or "Unknown"
        pos_isin = tx["pos_isin"]
        cache_key = f"{pos_name}||{pos_isin}"
        if cache_key not in created_positions:
            new_id = database.create_position(
                db,
                {
                    "name": pos_name,
                    "isin": pos_isin,
                    "ticker": None,
                    "units": 0,
                    "avg_buy_price": 0,
                    "monthly_rate": 0,
                    "target_weight": 0,
                    "asset_class": "etf",
                    "notes": "Auto-created via CSV import",
                },
                owner,
            )
            if pos_isin:
                ticker = lookup_ticker(pos_isin)
                if ticker:
                    database.update_position(db, new_id, {"ticker": ticker})
            created_positions[cache_key] = new_id
        tx["position_id"] = created_positions[cache_key]

    imported = 0
    skipped = 0
    for tx in txns:
        try:
            if database.transaction_exists(
                db, tx["position_id"], tx["date"], tx["units"], tx["price"]
            ):
                skipped += 1
                continue
            database.add_transaction(
                db, tx["position_id"], owner, tx["date"],
                tx["units"], tx["price"], tx["type"], tx["notes"],
            )
            imported += 1
        except Exception as e:
            errors.append(f"DB-Fehler: {e}")

    cash_balance, broker_label = csv_importer.parse_cash_balance(content)
    if cash_balance is not None and broker_label:
        database.upsert_broker_cash(db, owner, broker_label, cash_balance, date.today().isoformat())

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "format_detected": True,
        "broker_cash": {"broker": broker_label, "balance": cash_balance} if cash_balance is not None else None,
    }
