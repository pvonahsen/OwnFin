import logging
import threading
from datetime import datetime, timedelta, date

from apscheduler.schedulers.background import BackgroundScheduler

import database
import market
import calculations

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()
_sync_in_progress: bool = False


def is_sync_in_progress() -> bool:
    return _sync_in_progress


def _auto_checkin_all_users(conn) -> None:
    """Create or update today's check-in for every non-aggregate user based on current prices."""
    today = str(date.today())
    latest_prices = database.get_latest_prices(conn)

    try:
        owners = [u["id"] for u in database.get_regular_users(conn)]
    except Exception:
        owners = []

    for owner in owners:
        try:
            positions = database.get_positions(conn, owner=owner)
            settings  = database.get_settings(conn, owner)
            non_cash  = [p for p in positions if p.get("asset_class") != "cash"]
            invested  = calculations.portfolio_value(non_cash, latest_prices)
            if invested <= 0:
                continue
            cash = settings.get("cash", 0)
            database.upsert_checkin(conn, today, invested, cash, "Auto", owner=owner)
            logger.info(f"Auto check-in {owner}: {invested:.2f} € investiert, {cash:.2f} € cash")
        except Exception as e:
            logger.error(f"Auto check-in fehlgeschlagen für {owner}: {e}")


def _sync_job() -> None:
    """Täglicher Kursabruf um 20:00."""
    global _sync_in_progress
    _sync_in_progress = True
    logger.info("Täglicher Kursabruf gestartet...")
    conn = database.get_conn()
    try:
        result = market.sync_all_positions(conn)
        logger.info(f"Kursabruf abgeschlossen: {result['updated']} aktualisiert, {result['errors']} Fehler")
    except Exception as e:
        logger.error(f"Fehler im täglichen Kursabruf: {e}")
    finally:
        _sync_in_progress = False
        conn.close()


def _auto_checkin_job() -> None:
    """Automatischer Check-in um 20:05 (nach Kursabruf)."""
    today = str(date.today())
    conn = database.get_conn()
    try:
        # Skip if any user already has an auto-checkin today
        owners = [u["id"] for u in database.get_regular_users(conn)]
        if owners:
            existing = database.get_checkins(conn, owner=owners[0])
            if any(c["date"] == today and c.get("note") == "Auto" for c in existing):
                logger.info("Auto-Checkin heute bereits vorhanden, übersprungen")
                return
        _auto_checkin_all_users(conn)
    except Exception as e:
        logger.error(f"Fehler im Auto-Checkin-Job: {e}")
    finally:
        conn.close()


def _should_sync_on_start() -> bool:
    """Prüft ob beim Start ein Sync nötig ist (letzter Sync > 24h her oder nie)."""
    conn = database.get_conn()
    try:
        last_sync = database.get_last_sync(conn)
        if not last_sync:
            return True
        last_dt = datetime.fromisoformat(last_sync)
        return datetime.now() - last_dt > timedelta(hours=24)
    except Exception:
        return True
    finally:
        conn.close()


def start_scheduler() -> None:
    """APScheduler starten mit konfigurierbarer Zeitzone und Uhrzeit."""
    conn = database.get_conn()
    try:
        users = database.get_regular_users(conn)
        settings = database.get_settings(conn, users[0]["id"]) if users else {}
    except Exception:
        settings = {}
    finally:
        conn.close()

    tz = settings.get("scheduler_timezone", "Europe/Vienna")
    sync_time = settings.get("scheduler_sync_time", "20:00")
    try:
        sync_h, sync_m = map(int, sync_time.split(":"))
    except (ValueError, AttributeError):
        sync_h, sync_m = 20, 0

    _scheduler.add_job(
        _sync_job,
        trigger="cron",
        hour=sync_h,
        minute=sync_m,
        timezone=tz,
        id="daily_price_sync",
        replace_existing=True,
    )
    _scheduler.add_job(
        _auto_checkin_job,
        trigger="cron",
        hour=sync_h,
        minute=sync_m + 5,
        timezone=tz,
        id="daily_auto_checkin",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler gestartet ({sync_time} + 5min, {tz})")

    if _should_sync_on_start():
        logger.info("Letzter Sync > 24h her — starte initialen Kursabruf als Background-Thread...")
        # Starte Sync in separatem Thread → blockiert nicht den Startup
        thread = threading.Thread(target=_sync_job, daemon=True)
        thread.start()


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler gestoppt")
