"""
ISIN → Yahoo Finance ticker lookup via the OpenFIGI API.

Public API: lookup_ticker(isin, preferred_exch="GY") -> str | None

Free tier — no API key required for basic single-mapping requests.
"""
import json
import urllib.request
from typing import Optional

_OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"

_EXCH_TO_SUFFIX = {
    "GY": ".DE",   # XETRA
    "GF": ".F",    # Frankfurt
    "AV": ".VI",   # Vienna
    "LN": ".L",    # London Stock Exchange
    "SM": ".MC",   # Madrid
    "FP": ".PA",   # Paris Euronext
    "IM": ".MI",   # Milan
    "AX": ".AX",   # Australia
    "HK": ".HK",   # Hong Kong
    # US exchanges — no suffix
    "UN": "",      # NYSE
    "UQ": "",      # NASDAQ
    "UR": "",      # NYSE Arca
    "UP": "",      # OTC
}


def lookup_ticker(isin: str, preferred_exch: str = "GY") -> Optional[str]:
    """Return a Yahoo Finance ticker for the given ISIN, or None if not found.

    Queries the OpenFIGI v3 mapping API (no API key required for basic use).
    Prefers the exchange given by ``preferred_exch`` (default: "GY" = XETRA).
    Falls back to any exchange whose code is listed in _EXCH_TO_SUFFIX.
    Returns None if the ISIN is empty, if no result is found, or on any error.
    """
    if not isin:
        return None

    payload = json.dumps([{"idType": "ID_ISIN", "idValue": isin}]).encode()
    req = urllib.request.Request(
        _OPENFIGI_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read())
    except Exception:
        return None

    # body is a list with one item per mapping request
    if not body or not isinstance(body, list):
        return None

    result_block = body[0]
    if "data" not in result_block:
        return None

    candidates = result_block["data"]
    if not candidates:
        return None

    # Try the preferred exchange first
    preferred = [c for c in candidates if c.get("exchCode") == preferred_exch]
    fallback = [c for c in candidates if c.get("exchCode") in _EXCH_TO_SUFFIX and c.get("exchCode") != preferred_exch]

    for candidate in preferred + fallback:
        ticker = candidate.get("ticker")
        exch = candidate.get("exchCode", "")
        if not ticker:
            continue
        suffix = _EXCH_TO_SUFFIX.get(exch, None)
        if suffix is None:
            continue
        return ticker + suffix

    return None
