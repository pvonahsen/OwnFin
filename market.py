import logging
import time
from datetime import date, datetime
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)

# ── Currency conversion ───────────────────────────────────────────────────────

_fx_cache: dict = {}  # {pair: {"date": "YYYY-MM-DD", "rate": float}}

_FX_FALLBACKS = {"GBPEUR=X": 1.17, "HKDEUR=X": 0.1164, "USDEUR=X": 0.925}


def _eur_rate(pair: str) -> float:
    today = str(date.today())
    cached = _fx_cache.get(pair)
    if cached and cached["date"] == today:
        return cached["rate"]
    try:
        h = yf.Ticker(pair).history(period="2d")
        rate = float(h["Close"].iloc[-1]) if not h.empty else None
    except Exception:
        rate = None
    rate = rate or _FX_FALLBACKS.get(pair, 1.0)
    _fx_cache[pair] = {"date": today, "rate": rate}
    return rate


def _to_eur(ticker: str, raw: float) -> float:
    """Convert raw Yahoo Finance price to EUR."""
    if ticker.endswith(".L"):
        # LSE: Yahoo returns GBX (pence) → divide by 100 → GBP → EUR
        return (raw / 100.0) * _eur_rate("GBPEUR=X")
    if ticker.endswith(".HK"):
        return raw * _eur_rate("HKDEUR=X")
    if ticker == "4GLD.DE":
        # Xetra-Gold: Yahoo returns EUR/gram already; no conversion needed
        return raw
    return raw


def _try_symbol(symbol: str) -> Optional[float]:
    """Fetch closing price for a single Yahoo Finance symbol (ticker or ISIN). Returns None on any failure."""
    try:
        hist = yf.Ticker(symbol).history(period="5d")
        if hist.empty:
            return None
        price = float(hist["Close"].iloc[-1])
        if price != price:  # NaN
            return None
        return _to_eur(symbol, price)
    except Exception:
        return None


def fetch_price(ticker: str, isin: str = None) -> Optional[float]:
    """Aktuellen Schlusskurs in EUR abrufen.

    Tries the stored ticker first; if that yields nothing and an ISIN is
    supplied, tries the ISIN directly — Yahoo Finance accepts ISINs for most
    European securities.  Returns None only when both paths fail.
    """
    price = _try_symbol(ticker)
    if price is not None:
        return price
    if isin:
        logger.info(f"Ticker '{ticker}' lieferte keinen Kurs — versuche ISIN {isin}")
        price = _try_symbol(isin)
        if price is not None:
            logger.info(f"Kurs via ISIN {isin} gefunden (Ticker '{ticker}' ungültig)")
            return price
    logger.warning(f"Kein Kurs erhalten für {ticker}" + (f" / ISIN {isin}" if isin else ""))
    return None


def fetch_history(ticker: str, period: str = "2y") -> list:
    """Historische Schlusskurse [{date, price}] für den angegebenen Zeitraum."""
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period=period)
        if hist.empty:
            return []
        result = []
        for idx, row in hist.iterrows():
            price = float(row["Close"])
            if price == price:  # NaN überspringen
                result.append({"date": str(idx.date()), "price": price})
        return result
    except Exception as e:
        logger.error(f"History-Abruf fehlgeschlagen für {ticker}: {e}")
        return []


def fetch_dividends(ticker: str) -> list:
    """Dividenden-Historie [{date, amount_per_unit}]."""
    try:
        t = yf.Ticker(ticker)
        divs = t.dividends
        if divs.empty:
            return []
        result = []
        for idx, amount in divs.items():
            amt = float(amount)
            if amt == amt and amt > 0:  # NaN und 0 überspringen
                result.append({"date": str(idx.date()), "amount_per_unit": amt})
        return result
    except Exception as e:
        logger.error(f"Dividenden-Abruf fehlgeschlagen für {ticker}: {e}")
        return []


_benchmark_cache: dict = {}
_benchmark_irr_cache: dict = {}


def fetch_benchmark_irr(transactions: list, ticker: str = "IWDA.AS") -> Optional[dict]:
    """
    Fair benchmark IRR: simulates investing the same EUR amounts on the same dates into IWDA.
    For each buy, accumulates IWDA units; for each sell, reduces IWDA units proportionally.
    Then runs XIRR with the same cashflows + terminal IWDA value today.
    Returns {"irr_pct": float, "ticker": str, "terminal_value": float} or None.
    """
    from calculations import xirr as _xirr

    today_str = str(date.today())
    cache_key = f"irr:{ticker}:{today_str}:{len(transactions)}"
    cached = _benchmark_irr_cache.get(cache_key)
    if cached:
        return cached

    hist_prices: Optional[dict] = None
    ticker_used = ticker
    for t in (ticker, "URTH", "XDWD.DE"):
        raw = fetch_history(t, period="max")
        if not raw:
            raw = fetch_history(t, period="10y")
        if raw:
            hist_prices = {h["date"]: h["price"] for h in raw}
            ticker_used = t
            break
    if not hist_prices:
        return None

    sorted_dates = sorted(hist_prices.keys())

    def nearest_price(date_str: str) -> Optional[float]:
        if date_str in hist_prices:
            return hist_prices[date_str]
        # nearest on or after
        for d in sorted_dates:
            if d >= date_str:
                return hist_prices[d]
        # fallback: last known
        return hist_prices[sorted_dates[-1]] if sorted_dates else None

    current_price = hist_prices[sorted_dates[-1]]

    cashflows = []
    net_iwda_units = 0.0

    for tx in sorted(transactions, key=lambda t: t["date"]):
        date_str = tx["date"] if len(tx["date"]) == 10 else tx["date"][:7] + "-01"
        eur_value = tx["units"] * tx["price"]   # >0 for buy, <0 for sell
        iwda_p = nearest_price(date_str)
        if not iwda_p:
            continue
        cashflows.append((date_str, -eur_value))   # negative = outflow for buy, positive = inflow for sell
        net_iwda_units += eur_value / iwda_p        # accumulate/reduce units proportionally

    if not cashflows or net_iwda_units <= 0:
        return None

    terminal_value = round(net_iwda_units * current_price, 2)
    cashflows.append((today_str, terminal_value))

    irr = _xirr(cashflows)
    result = {"irr_pct": irr, "ticker": ticker_used, "terminal_value": terminal_value}
    _benchmark_irr_cache[cache_key] = result
    return result


def fetch_benchmark_cagr(since_date: str, ticker: str = "IWDA.AS") -> Optional[float]:
    """
    Annualisierte Rendite (CAGR) des Benchmark-ETF seit since_date.
    Fallback: URTH, XDWD.DE. Ergebnis wird tagesweise gecacht.
    """
    today = str(date.today())
    cache_key = f"{ticker}:{since_date}"
    cached = _benchmark_cache.get(cache_key)
    if cached and cached["date"] == today:
        return cached["cagr"]

    for t in (ticker, "URTH", "XDWD.DE"):
        hist = fetch_history(t, period="5y")
        if not hist:
            continue
        sorted_hist = sorted(hist, key=lambda x: x["date"])
        start = next((h for h in sorted_hist if h["date"] >= since_date), None)
        if not start:
            continue
        end = sorted_hist[-1]
        days = (datetime.strptime(end["date"], "%Y-%m-%d") - datetime.strptime(start["date"], "%Y-%m-%d")).days
        if days <= 30:
            continue
        years = days / 365.25
        cagr = round(((end["price"] / start["price"]) ** (1 / years) - 1) * 100, 2)
        _benchmark_cache[cache_key] = {"date": today, "cagr": cagr, "benchmark_ticker": t}
        return cagr

    return None


def sync_all_positions(conn) -> dict:
    """
    Aktualisiert die prices-Tabelle für alle aktiven Positionen mit Ticker.
    Cash-Positionen werden übersprungen (kein Ticker, Kurs = 1.0).
    Gibt Statistik zurück: {updated, errors, timestamp}
    """
    import database

    positions = database.get_positions(conn)
    today = str(date.today())
    updated = 0
    errors = 0

    for pos in positions:
        ticker = pos.get("ticker")

        # Cash und Positionen ohne Ticker überspringen
        if not ticker or pos.get("asset_class") == "cash":
            continue

        isin = pos.get("isin") or None
        price = fetch_price(ticker, isin=isin)

        if price is not None:
            database.upsert_price(conn, pos["id"], today, price)
            database.update_position_sync_error(conn, pos["id"], None)
            updated += 1
            logger.info(f"Kurs aktualisiert: {pos['name']} ({ticker}) = {price:.4f}")
        else:
            err = f"Kein Kurs: {ticker}" + (f" / ISIN {isin}" if isin else "")
            database.update_position_sync_error(conn, pos["id"], err)
            errors += 1

        # Rate Limiting: 1 Sekunde Pause zwischen Abrufen
        time.sleep(1)

    conn.commit()

    timestamp = datetime.now().isoformat()
    database.save_last_sync(conn, timestamp)

    logger.info(f"Sync abgeschlossen: {updated} aktualisiert, {errors} Fehler")
    return {"updated": updated, "errors": errors, "timestamp": timestamp}
