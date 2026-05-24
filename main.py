import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import database
import scheduler
from routers import (
    settings as settings_router,
    positions as positions_router,
    prices as prices_router,
    checkins as checkins_router,
    sparplans as sparplans_router,
    dividends as dividends_router,
    portfolio as portfolio_router,
    imports as imports_router,
    baselines as baselines_router,
    transactions as transactions_router,
    banking as banking_router,
    realized_gains as realized_gains_router,
    auth as auth_router,
    users as users_router,
    phases as phases_router,
)

_config_path = Path(__file__).parent / "config.json"
APP_VERSION = json.loads(_config_path.read_text())["version"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _log_db_stats() -> None:
    import sqlite3
    path = database.DB_PATH
    size = os.path.getsize(path) if os.path.exists(path) else 0
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    pos   = conn.execute("SELECT COUNT(*) FROM positions WHERE is_active=1").fetchone()[0]
    tx    = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    sells = conn.execute("SELECT COUNT(*) FROM transactions WHERE units < 0").fetchone()[0]
    deact = conn.execute("SELECT COUNT(*) FROM positions WHERE is_active=0").fetchone()[0]
    sell_names = conn.execute(
        "SELECT DISTINCT p.name FROM transactions t JOIN positions p ON t.position_id=p.id WHERE t.units < 0"
    ).fetchall()
    conn.close()
    logger.info(f"DB: {path} ({size:,} bytes)")
    logger.info(f"DB stats: {pos} aktive Positionen, {deact} inaktiv, {tx} Transaktionen, {sells} Verkäufe")
    if sell_names:
        logger.info(f"Positionen mit Verkäufen: {', '.join(r['name'] for r in sell_names)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Finanz-Dashboard startet...")
    database.init_db()
    _log_db_stats()
    scheduler.start_scheduler()
    yield
    scheduler.stop_scheduler()
    logger.info("Finanz-Dashboard gestoppt")


app = FastAPI(
    title="Finanz-Dashboard",
    description="Persönliches Finanz-Dashboard mit Phasenmodell und Live-Kursen",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Alle Router einbinden
app.include_router(settings_router.router)
app.include_router(positions_router.router)
app.include_router(prices_router.router)
app.include_router(checkins_router.router)
app.include_router(sparplans_router.router)
app.include_router(dividends_router.router)
app.include_router(portfolio_router.router)
app.include_router(imports_router.router)
app.include_router(baselines_router.router)
app.include_router(transactions_router.router)
app.include_router(banking_router.router)
app.include_router(realized_gains_router.router)
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(phases_router.router)


@app.get("/api/version")
def get_version():
    return {"version": APP_VERSION}


_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        candidate = os.path.join(_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"))
else:
    # Dev fallback: serve raw index.html (no Vite build present)
    @app.get("/", include_in_schema=False)
    def serve_frontend_dev():
        return FileResponse(os.path.join(os.path.dirname(__file__), "frontend", "index.html"))
