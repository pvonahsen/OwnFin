import logging
import time

from fastapi import APIRouter, Depends, BackgroundTasks
import sqlite3

import database
import market

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("/latest")
def latest_prices(db: sqlite3.Connection = Depends(database.get_db)):
    prices = database.get_latest_prices(db)
    return {str(k): v for k, v in prices.items()}


@router.get("/last-sync")
def last_sync(db: sqlite3.Connection = Depends(database.get_db)):
    import scheduler
    return {"last_sync": database.get_last_sync(db), "syncing": scheduler.is_sync_in_progress()}


@router.get("/sync")
def trigger_sync(background_tasks: BackgroundTasks, db: sqlite3.Connection = Depends(database.get_db)):
    """Manueller Kursabruf aller aktiven Positionen (Hintergrund)."""
    import scheduler
    
    def run_sync():
        scheduler._sync_in_progress = True
        conn = database.get_conn()
        try:
            market.sync_all_positions(conn)
            logger.info("Manueller Kursabruf abgeschlossen")
        except Exception as e:
            logger.error(f"Fehler beim manuellen Kursabruf: {e}")
        finally:
            scheduler._sync_in_progress = False
            conn.close()

    background_tasks.add_task(run_sync)
    return {"ok": True, "message": "Kursabruf gestartet (läuft im Hintergrund)"}


@router.post("/backfill")
def backfill_prices(
    background_tasks: BackgroundTasks,
    period: str = "2y",
):
    """Historische Kursdaten für alle Positionen nachladen (Hintergrund)."""
    def run_backfill():
        conn = database.get_conn()
        try:
            positions = database.get_positions(conn)
            updated, errors = 0, 0
            for pos in positions:
                ticker = pos.get("ticker")
                if not ticker or pos.get("asset_class") == "cash":
                    continue
                history = market.fetch_history(ticker, period=period)
                if not history:
                    errors += 1
                    continue
                for entry in history:
                    price_eur = market._to_eur(ticker, entry["price"])
                    database.upsert_price(conn, pos["id"], entry["date"], price_eur)
                conn.commit()
                updated += 1
                time.sleep(0.5)
            logger.info(f"Backfill done: {updated} positions, {errors} errors")
        finally:
            conn.close()

    background_tasks.add_task(run_backfill)
    return {"ok": True, "message": f"Historischer Kursabruf gestartet (Zeitraum: {period})"}
