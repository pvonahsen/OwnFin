"""
Broker CSV import: Trade Republic, Flatex, Bitpanda, generic.
Siemens Employee Share Program: xlsx export (parse_siemens_xlsx).
Auto-detects format. Bitpanda exports include metadata preamble — skipped automatically.
"""
import csv
import io
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ── Asset / name mappings ──────────────────────────────────────────────────────

_CRYPTO_MAP = {
    "btc": "bitcoin", "bitcoin": "bitcoin",
    "eth": "ethereum", "ethereum": "ethereum",
    "sol": "solana",
}

# Bitpanda uses ticker symbols; map to position names in our DB
_BITPANDA_TICKER_MAP = {
    "nvda": "nvidia",
    "msft": "microsoft",
    "adbe": "adobe",
    "lnvgy": "lenovo group",
    "amd": "amd",
    "dell": "dell",
}

_BUY_TYPES  = {"kauf", "buy", "sparplan", "savings plan", "sparplan ausführung", "purchase", "wertpapierkauf"}
_SELL_TYPES = {"verkauf", "sell", "sale", "wertpapierverkauf"}

# EUR cash-flow column names used by supported brokers
_CASH_AMOUNT_COLS = (
    "gesamtbetrag",   # Trade Republic (German)
    "buchungsbetrag", # Flatex
    "buchungswert",   # Flatex variant
    "amount",         # Trade Republic (English/new format)
    "betrag",         # Generic German
    "betrag in eur",
    "wert in eur",    # TR old format
    "gesamt",
    "total amount",
    "total",
)

# Substrings that mark a row as non-trading → skip silently
_SKIP_WORDS = {
    "thesaurierung",        # Flatex fictitious reinvestment for tax (silent skip)
    "dividende", "dividend",
    "einlage", "deposit",
    "auszahlung", "withdrawal",
    "zinsen", "interest",
    "gebühr", "fee",
    "steuer", "tax",
    "storno", "cancellation",
    "transfer",             # TR transfers, Bitpanda stake/unstake
    "card_transaction",
    "interest_payment",
    "customer_outbound",
    "earnings",             # TR dividend equivalent
    "reward",               # Bitpanda staking reward
    "reverse split",        # Flatex corporate action
}


# ── Low-level helpers ──────────────────────────────────────────────────────────

def _detect_sep(text: str) -> str:
    first = text.split("\n")[0]
    return ";" if first.count(";") > first.count(",") else ","


def _find_header_row(text: str, sep: str) -> str:
    """
    Bitpanda exports start with 6 metadata lines before the real CSV header.
    Scan until we find the line that contains the actual column names.
    Returns the text starting from that header line.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        low = line.lower().replace('"', '').replace("'", "").replace(" ", "")
        if sep in line and ("transactionid" in low or "transaction_id" in low):
            return "\n".join(lines[i:])
    return text  # not Bitpanda — return unchanged


def _norm_headers(row: dict) -> dict:
    """Lowercase + strip all keys and values; treat missing/dash values as empty."""
    return {
        k.lower().strip().strip('"').replace("﻿", ""): (v or "").strip()
        for k, v in row.items()
    }


def _col(row: dict, *candidates) -> Optional[str]:
    """Return first non-empty, non-placeholder value matching any candidate key."""
    for c in candidates:
        v = row.get(c, "")
        if v and v.strip() and v.strip() not in ("-", "n/a", "N/A"):
            return v.strip()
    return None


def _parse_date(s: str) -> str:
    s = s.strip().split("T")[0].split(" ")[0]
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError(f"Ungültiges Datum: {s!r}")


def _parse_num(s: str) -> float:
    s = s.strip().replace("\xa0", "").replace(" ", "").lstrip("+-").replace("−", "").replace("–", "")
    if not s or s == "-":
        raise ValueError("Leerer Zahlenwert")
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):   # German: 1.234,56
            s = s.replace(".", "").replace(",", ".")
        else:                              # English: 1,234.56
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


def _resolve_position(
    isin: Optional[str],
    name: Optional[str],
    isin_map: dict,
    name_map: dict,
    auto_create: bool = True,
) -> Optional[dict]:
    if isin:
        pos = isin_map.get(isin.upper().strip())
        if pos:
            return pos
    if name:
        key = name.lower().strip()
        if key in name_map:
            return name_map[key]
        for k, p in name_map.items():
            if k in key or key in k:
                return p
        crypto_key = _CRYPTO_MAP.get(key)
        if crypto_key:
            return name_map.get(crypto_key)
    if auto_create:
        return {"id": None, "name": name, "isin": isin, "needs_create": True}
    return None


def _should_skip(tx_type_raw: str) -> bool:
    return any(w in tx_type_raw for w in _SKIP_WORDS)


def _detect_format(cols: set) -> str:
    # Bitpanda: "transaction id" with space, distinct from TR's "transaction_id"
    if "transaction id" in cols and "asset class" in cols:
        return "bitpanda"
    # Trade Republic new format: "transaction_id" with underscore
    if "transaction_id" in cols and "shares" in cols:
        return "trade_republic"
    # Trade Republic old format
    if ("typ" in cols or "type" in cols) and ("isin" in cols or "symbol" in cols):
        return "trade_republic"
    # Flatex: German bank column names
    if "buchungstag" in cols or "buchungsdatum" in cols or "buchungsinformation" in cols:
        return "flatex"
    return "generic"


# ── Trade Republic ─────────────────────────────────────────────────────────────

def _parse_trade_republic(rows: list, isin_map: dict, name_map: dict, auto_create: bool = True) -> tuple:
    txns, errors = [], []
    for i, raw in enumerate(rows, start=2):
        r = _norm_headers(raw)
        try:
            tx_type_raw = (_col(r, "type", "typ", "art", "buchungsart") or "").lower()

            if _should_skip(tx_type_raw):
                continue
            is_sell = any(s in tx_type_raw for s in _SELL_TYPES)
            is_buy  = not is_sell and any(b in tx_type_raw for b in _BUY_TYPES)
            if not is_buy and not is_sell:
                continue

            date_str  = _parse_date(_col(r, "date", "datum", "buchungsdatum", "datetime") or "")
            isin      = _col(r, "isin", "symbol")           # new TR: ISIN is in "symbol"
            name      = _col(r, "name", "titel", "wertpapier", "title", "bezeichnung")
            units_raw = _col(r, "shares", "stückzahl", "stück", "anteile", "menge", "stk", "anzahl")
            price_raw = _col(r, "price", "kurs", "kurs (€)", "kurswert", "kurs in eur")

            if not units_raw or not price_raw:
                errors.append(f"Zeile {i}: Stückzahl oder Kurs fehlt")
                continue

            units = _parse_num(units_raw)
            price = _parse_num(price_raw)
            if price <= 0 or units <= 0:
                continue

            pos = _resolve_position(isin, name, isin_map, name_map, auto_create=auto_create)
            if not pos:
                errors.append(f"Zeile {i}: Position '{name}' (ISIN: {isin}) nicht gefunden")
                continue

            txns.append({
                "position_id": pos["id"],
                "needs_create": pos.get("needs_create", False),
                "pos_name": pos.get("name") if pos.get("needs_create") else None,
                "pos_isin": pos.get("isin") if pos.get("needs_create") else None,
                "date":  date_str,
                "units": units if is_buy else -units,
                "price": price,
                "type":  "buy" if is_buy else "sell",
                "notes": "Trade Republic Import",
            })
        except Exception as e:
            errors.append(f"Zeile {i}: {e}")
    return txns, errors


# ── Flatex ─────────────────────────────────────────────────────────────────────

def _parse_flatex(rows: list, isin_map: dict, name_map: dict, auto_create: bool = True) -> tuple:
    txns, errors = [], []
    for i, raw in enumerate(rows, start=2):
        r = _norm_headers(raw)
        try:
            # Actual Flatex format: type lives in "buchungsinformation"
            # e.g. "Ausführung ORDER Kauf IE00BM67HT60 ..."
            tx_type_raw = (
                _col(r, "buchungsinformation", "buchungsart", "art", "typ", "transaktionsart") or ""
            ).lower()

            if _should_skip(tx_type_raw):
                continue
            is_sell = any(s in tx_type_raw for s in _SELL_TYPES)
            is_buy  = not is_sell and any(b in tx_type_raw for b in _BUY_TYPES)
            if not is_buy and not is_sell:
                continue

            date_str  = _parse_date(
                _col(r, "buchungstag", "buchungsdatum", "valuta", "datum", "handelsdatum") or ""
            )
            isin      = _col(r, "isin")
            name      = _col(r, "bezeichnung", "wertpapierbezeichnung", "titel", "wertpapier", "name")
            # Actual Flatex: units are in "Nominal (Stk.)" with parentheses in header name
            units_raw = _col(r, "nominal (stk.)", "stück", "stückzahl", "menge", "anteile", "nominal")
            price_raw = _col(r, "kurs", "kurs in eur", "kurswert", "preis")

            if not units_raw or not price_raw:
                errors.append(f"Zeile {i}: Stückzahl oder Kurs fehlt")
                continue

            units = abs(_parse_num(units_raw))
            price = abs(_parse_num(price_raw))
            if price <= 0 or units <= 0:
                continue

            pos = _resolve_position(isin, name, isin_map, name_map, auto_create=auto_create)
            if not pos:
                errors.append(f"Zeile {i}: Position '{name}' (ISIN: {isin}) nicht gefunden")
                continue

            txns.append({
                "position_id": pos["id"],
                "needs_create": pos.get("needs_create", False),
                "pos_name": pos.get("name") if pos.get("needs_create") else None,
                "pos_isin": pos.get("isin") if pos.get("needs_create") else None,
                "date":  date_str,
                "units": units if is_buy else -units,
                "price": price,
                "type":  "buy" if is_buy else "sell",
                "notes": "Flatex Import",
            })
        except Exception as e:
            errors.append(f"Zeile {i}: {e}")
    return txns, errors


# ── Bitpanda ───────────────────────────────────────────────────────────────────

def _parse_bitpanda(rows: list, isin_map: dict, name_map: dict, auto_create: bool = True) -> tuple:
    txns, errors = [], []
    for i, raw in enumerate(rows, start=2):
        r = _norm_headers(raw)
        try:
            tx_type_raw = (_col(r, "transaction type", "type") or "").lower()

            if _should_skip(tx_type_raw):
                continue
            is_sell = any(s in tx_type_raw for s in _SELL_TYPES)
            is_buy  = not is_sell and any(b in tx_type_raw for b in _BUY_TYPES)
            if not is_buy and not is_sell:
                continue

            ts = _col(r, "timestamp", "date", "datum") or ""
            date_str = _parse_date(ts.split("+")[0].split("Z")[0] if "T" in ts else ts)

            asset     = _col(r, "asset", "asset name", "coin") or ""
            price_raw = _col(r, "asset market price", "price", "kurs")
            units_raw = _col(r, "amount asset", "amount", "anzahl", "menge")

            if not units_raw or not price_raw:
                errors.append(f"Zeile {i}: Amount oder Preis fehlt")
                continue

            units = abs(_parse_num(units_raw))
            price = abs(_parse_num(price_raw))
            if units <= 0:
                continue
            if is_buy and price <= 0:  # sells can be at €0 for worthless assets (e.g. DOGA)
                continue

            # Map Bitpanda ticker symbols to our position names
            canonical = _BITPANDA_TICKER_MAP.get(asset.lower(), asset.lower())
            pos = _resolve_position(None, canonical, isin_map, name_map, auto_create=auto_create)
            if not pos:
                errors.append(f"Zeile {i}: Asset '{asset}' nicht gefunden")
                continue

            txns.append({
                "position_id": pos["id"],
                "needs_create": pos.get("needs_create", False),
                "pos_name": pos.get("name") if pos.get("needs_create") else None,
                "pos_isin": pos.get("isin") if pos.get("needs_create") else None,
                "date":  date_str,
                "units": units if is_buy else -units,
                "price": price,
                "type":  "buy" if is_buy else "sell",
                "notes": f"Bitpanda Import ({asset})",
            })
        except Exception as e:
            errors.append(f"Zeile {i}: {e}")
    return txns, errors


# ── Generic ────────────────────────────────────────────────────────────────────

def _parse_generic(rows: list, isin_map: dict, name_map: dict, auto_create: bool = True) -> tuple:
    txns, errors = [], []
    for i, raw in enumerate(rows, start=2):
        r = _norm_headers(raw)
        try:
            name  = _col(r, "position_name", "name", "titel")
            isin  = _col(r, "isin")
            pos   = _resolve_position(isin, name, isin_map, name_map, auto_create=auto_create)
            if not pos:
                errors.append(f"Zeile {i}: Position '{name}' nicht gefunden")
                continue
            tx_type  = (_col(r, "type", "typ") or "buy").lower()
            raw_units = _parse_num(_col(r, "units", "stück", "menge") or "0")
            units    = raw_units if tx_type == "buy" else -abs(raw_units)
            price    = _parse_num(_col(r, "price", "kurs") or "0")
            txns.append({
                "position_id": pos["id"],
                "needs_create": pos.get("needs_create", False),
                "pos_name": pos.get("name") if pos.get("needs_create") else None,
                "pos_isin": pos.get("isin") if pos.get("needs_create") else None,
                "date":  _parse_date(_col(r, "date", "datum") or ""),
                "units": units,
                "price": price,
                "type":  tx_type,
                "notes": _col(r, "notes", "notiz") or None,
            })
        except Exception as e:
            errors.append(f"Zeile {i}: {e}")
    return txns, errors


# ── Siemens Employee Share Program (xlsx) ──────────────────────────────────────

SIEMENS_ISIN = "DE0007236101"
SIEMENS_NAME = "Siemens AG"
SIEMENS_SMP_NAME = "Siemens SMP"

# Row index (0-based) of the column header row in the Siemens xlsx export.
# Rows 0-5 are metadata (Participant name, User ID, As of date, empty, Note, empty).
_SIEMENS_HEADER_ROW = 6


def _find_col(df_cols: list, *candidates: str) -> Optional[str]:
    """Return the first df column name that contains any candidate substring."""
    for c in df_cols:
        cl = c.lower()
        for cand in candidates:
            if cand.lower() in cl:
                return c
    return None


def parse_siemens_xlsx(content_bytes: bytes, positions: list, auto_create: bool = True) -> tuple:
    """
    Parse the Siemens Employee Share Program xlsx export.

    Relevant columns (header at row 7, 0-based index 6):
      - Allocation date      → transaction date
      - Contribution type    → filter for "Purchase" only
      - Strike price / Cost basis → price paid per share (€ prefix, comma decimal)
      - Allocated quantity   → number of shares (comma decimal, fractional)

    Resolves against the Siemens position by ISIN (DE0007236101) or name.
    Auto-creates the position if not found.
    """
    try:
        import pandas as pd
    except ImportError:
        return [], ["pandas nicht installiert — 'pip install pandas openpyxl'"]

    try:
        df = pd.read_excel(
            io.BytesIO(content_bytes),
            header=_SIEMENS_HEADER_ROW,
            engine="openpyxl",
            dtype=str,
        )
    except Exception as e:
        return [], [f"Excel-Lesefehler: {e}"]

    # Normalize column names for matching
    df.columns = [str(c).strip() for c in df.columns]
    cols = list(df.columns)

    col_date   = _find_col(cols, "allocation date")
    col_type   = _find_col(cols, "contribution type")
    col_price  = _find_col(cols, "strike price", "cost basis")
    col_units  = _find_col(cols, "allocated quantity")

    missing = [name for name, col in [
        ("Allocation date", col_date),
        ("Contribution type", col_type),
        ("Strike price / Cost basis", col_price),
        ("Allocated quantity", col_units),
    ] if col is None]
    if missing:
        return [], [f"Siemens-Export: Spalten nicht gefunden: {', '.join(missing)}"]

    name_map = {p["name"].lower().strip(): p for p in positions}

    # Always target "Siemens SMP" by exact name — never resolve by ISIN, which would
    # find "sie" (the old broker position that has the same ISIN but is sold/inactive).
    pos = name_map.get(SIEMENS_SMP_NAME.lower())
    if pos is None and auto_create:
        pos = {"id": None, "name": SIEMENS_SMP_NAME, "isin": SIEMENS_ISIN, "needs_create": True}

    txns, errors = [], []
    for i, row in df.iterrows():
        raw_type = str(row.get(col_type, "") or "").strip().lower()
        if raw_type != "purchase":
            continue

        row_num = i + _SIEMENS_HEADER_ROW + 2  # human-readable row number

        try:
            date_str = _parse_date(str(row[col_date]).strip())
        except Exception as e:
            errors.append(f"Zeile {row_num}: Datum ungültig — {e}")
            continue

        try:
            price_raw = str(row[col_price]).strip().lstrip("€").strip()
            price = _parse_num(price_raw)
        except Exception as e:
            errors.append(f"Zeile {row_num}: Preis ungültig — {e}")
            continue

        try:
            units = _parse_num(str(row[col_units]).strip())
        except Exception as e:
            errors.append(f"Zeile {row_num}: Anzahl ungültig — {e}")
            continue

        if price <= 0 or units <= 0:
            continue

        if not pos:
            errors.append(f"Zeile {row_num}: Siemens-SMP-Position nicht gefunden")
            continue

        txns.append({
            "position_id": pos["id"],
            "needs_create": pos.get("needs_create", False),
            "pos_name": SIEMENS_SMP_NAME if pos.get("needs_create") else None,
            "pos_isin": SIEMENS_ISIN if pos.get("needs_create") else None,
            "date":  date_str,
            "units": units,
            "price": price,
            "type":  "buy",
            "notes": "Siemens Mitarbeiteraktien Import",
        })

    return txns, errors


# ── Broker cash balance ────────────────────────────────────────────────────────

_BROKER_LABELS = {
    "trade_republic": "Trade Republic",
    "flatex":         "Flatex",
    "bitpanda":       "Bitpanda",
}

# Column names that contain a running account balance (not a per-row amount).
# Prefer these over summing transaction amounts — they reflect the true balance
# even when the CSV covers only a partial history.
_BALANCE_COLS = (
    "saldo nach buchung",   # Flatex
    "saldo",                # Flatex variant / generic German
    "balance after booking",
    "balance",              # generic English
    "account balance",
    "kontostand",
)


def _extract_row_eur_amount(r: dict) -> Optional[float]:
    for col in _CASH_AMOUNT_COLS:
        v = r.get(col, "").strip()
        if not v or v in ("-", "n/a", "N/A"):
            continue
        try:
            # _parse_num strips sign; detect and re-apply it
            negative = v.startswith("-") or v.startswith("−") or v.startswith("–")
            amount = _parse_num(v)
            return -amount if negative else amount
        except ValueError:
            continue
    return None


def _extract_running_balance(r: dict) -> Optional[float]:
    """Return the running balance from a row if a balance column is present."""
    for col in _BALANCE_COLS:
        v = r.get(col, "").strip()
        if not v or v in ("-", "n/a", "N/A"):
            continue
        try:
            negative = v.startswith("-") or v.startswith("−") or v.startswith("–")
            amount = _parse_num(v)
            return -amount if negative else amount
        except ValueError:
            continue
    return None


def parse_cash_balance(content_bytes: bytes) -> tuple:
    """
    Derive the current cash balance from a broker CSV.

    Strategy (in priority order):
    1. If the CSV has a running-balance column (e.g. Flatex "Saldo nach Buchung"),
       use the LAST non-empty value — accurate even for partial-history exports.
    2. Otherwise sum all per-row EUR amounts (deposits +, buys −, sells +, fees −).
       This is correct only for complete-history exports (Trade Republic full export).

    Returns (balance: float, broker_label: str) on success,
    or (None, broker_label) if the format is known but no balance data found,
    or (None, None) for unknown/generic formats.
    """
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "iso-8859-1"):
        try:
            text = content_bytes.decode(enc)
            break
        except Exception:
            pass
    if text is None:
        return None, None

    sep = _detect_sep(text)
    text = _find_header_row(text, sep)
    try:
        rows = list(csv.DictReader(io.StringIO(text), delimiter=sep))
    except Exception:
        return None, None
    if not rows:
        return None, None

    cols = {k.lower().strip().strip('"').replace("﻿", "") for k in rows[0].keys()}
    fmt = _detect_format(cols)
    broker_label = _BROKER_LABELS.get(fmt)
    if not broker_label:
        return None, None  # generic format — can't confidently label the broker

    # Pass 1: try running-balance column (last non-null value wins)
    last_balance = None
    for raw in rows:
        r = _norm_headers(raw)
        bal = _extract_running_balance(r)
        if bal is not None:
            last_balance = bal
    if last_balance is not None:
        return (round(last_balance, 2), broker_label)

    # Pass 2: fall back to summing per-row transaction amounts
    total = 0.0
    found_any = False
    for raw in rows:
        r = _norm_headers(raw)
        amount = _extract_row_eur_amount(r)
        if amount is not None:
            total += amount
            found_any = True

    return (round(total, 2), broker_label) if found_any else (None, broker_label)


# ── Public API ─────────────────────────────────────────────────────────────────

def parse_csv(content_bytes: bytes, positions: list, auto_create: bool = True) -> tuple:
    """
    Auto-detect broker format and parse into transaction dicts.
    Returns (transactions: list[dict], errors: list[str])

    When auto_create=True (default), transactions for unknown positions are
    returned with needs_create=True and position_id=None instead of being
    dropped as errors. The router is responsible for creating those positions
    before inserting the transactions.

    Supported formats:
    - Trade Republic (new: transaction_id col; old: type+isin cols)
    - Flatex (buchungstag / buchungsinformation cols)
    - Bitpanda (transaction id + asset class cols; auto-skips metadata preamble)
    - Generic (date, position_name, units, price, type)
    """
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "iso-8859-1"):
        try:
            text = content_bytes.decode(enc)
            break
        except Exception:
            pass
    if text is None:
        return [], ["Datei konnte nicht dekodiert werden"]

    sep = _detect_sep(text)

    # Bitpanda exports have 6 metadata lines before the real header — strip them
    text = _find_header_row(text, sep)

    try:
        rows = list(csv.DictReader(io.StringIO(text), delimiter=sep))
    except Exception as e:
        return [], [f"CSV-Parse-Fehler: {e}"]
    if not rows:
        return [], ["CSV leer oder keine Datenzeilen"]

    cols = {k.lower().strip().strip('"').replace("﻿", "") for k in rows[0].keys()}
    fmt  = _detect_format(cols)
    logger.info(f"Broker format: {fmt} | sep={sep!r} | cols sample: {list(cols)[:8]}")

    # ISIN match has priority; only include positions that actually have an ISIN
    isin_map = {p["isin"].upper(): p for p in positions if p.get("isin")}
    name_map = {p["name"].lower().strip(): p for p in positions}

    parsers = {
        "trade_republic": _parse_trade_republic,
        "flatex":         _parse_flatex,
        "bitpanda":       _parse_bitpanda,
        "generic":        _parse_generic,
    }
    return parsers[fmt](rows, isin_map, name_map, auto_create=auto_create)
