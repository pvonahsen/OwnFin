"""
Tests for banking CSV import, deduplication, and categorization rules.

CSV format (Tomorrow Bank):
  account_type,booking_date,valuta_date,sender_or_recipient,iban,
  booking_type,description,category,amount,currency

Amounts use German format: comma = decimal separator, period = thousands sep.
"""
import io
import pytest
from routers.banking import _parse_eur


# ── _parse_eur unit tests ─────────────────────────────────────────────────────

def test_parse_eur_integer():
    assert _parse_eur("100") == 100.0

def test_parse_eur_german_decimal():
    assert _parse_eur("-45,50") == -45.50

def test_parse_eur_thousands_separator():
    assert _parse_eur("1.234,56") == 1234.56

def test_parse_eur_negative_with_thousands():
    assert _parse_eur("-1.500,00") == -1500.0

def test_parse_eur_nbsp_thousands():
    # Non-breaking space (U+00A0) as thousands separator
    assert _parse_eur("2 500,00") == 2500.0

def test_parse_eur_narrow_nbsp():
    assert _parse_eur("3 000,00") == 3000.0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_csv(*rows):
    """Build a minimal Tomorrow Bank CSV from a list of dicts."""
    header = "account_type,booking_date,valuta_date,sender_or_recipient,iban,booking_type,description,category,amount,currency"
    lines = [header]
    for r in rows:
        lines.append(
            f"{r.get('account_type','Hauptkonto')},"
            f"{r.get('booking_date','2026-05-01')},"
            f"{r.get('valuta_date','2026-05-01')},"
            f"{r.get('sender_or_recipient','')},"
            f"{r.get('iban','')},"
            f"{r.get('booking_type','SEPA')},"
            f"{r.get('description','Test')},"
            f"{r.get('category','Andere')},"
            f"\"{r.get('amount','-10,00')}\","
            f"EUR"
        )
    return "\n".join(lines).encode("utf-8")


# ── Import endpoint ───────────────────────────────────────────────────────────

def test_import_creates_account_and_transactions(client):
    csv_bytes = _make_csv(
        {"description": "REWE", "amount": "-45,50"},
        {"description": "Salary", "amount": "2.500,00"},
    )

    r = client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert r.status_code == 200
    result = r.json()
    assert result["imported"] == 2
    assert result["skipped"] == 0
    assert result["errors"] == []

    accounts = client.get("/api/banking/accounts?owner=Paul").json()
    assert len(accounts) == 1
    assert "Tomorrow" in accounts[0]["name"]

    txns = client.get("/api/banking/transactions?owner=Paul").json()
    assert len(txns) == 2
    descriptions = {t["description"] for t in txns}
    assert "REWE" in descriptions
    assert "Salary" in descriptions


def test_import_deduplication(client):
    csv_bytes = _make_csv({"description": "Netflix", "amount": "-12,99"})

    first = client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()
    assert first["imported"] == 1

    second = client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()
    assert second["imported"] == 0
    assert second["skipped"] == 1

    txns = client.get("/api/banking/transactions?owner=Paul").json()
    assert len(txns) == 1


def test_import_unsupported_bank_returns_400(client):
    csv_bytes = _make_csv({"description": "X"})
    r = client.post(
        "/api/banking/import?owner=Paul&bank=DKB",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert r.status_code == 400


def test_import_amounts_parsed_correctly(client):
    csv_bytes = _make_csv(
        {"description": "BigPurchase", "amount": "-1.234,56"},
    )
    client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    txns = client.get("/api/banking/transactions?owner=Paul").json()
    assert txns[0]["amount"] == pytest.approx(-1234.56)


# ── Categorization rules ──────────────────────────────────────────────────────

def test_cat_rule_applied_on_import(client):
    # Create a rule: description contains "REWE" → category "Lebensmittel"
    r = client.post("/api/banking/rules", json={
        "keyword": "REWE",
        "field": "description",
        "match_type": "contains",
        "category": "Lebensmittel",
        "priority": 10,
    })
    assert r.status_code == 201

    csv_bytes = _make_csv({"description": "REWE Filiale 42", "amount": "-33,00"})
    client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    )

    txns = client.get("/api/banking/transactions?owner=Paul").json()
    assert len(txns) == 1
    assert txns[0]["custom_category"] == "Lebensmittel"


def test_cat_rule_not_applied_to_non_matching_tx(client):
    client.post("/api/banking/rules", json={
        "keyword": "REWE",
        "field": "description",
        "match_type": "contains",
        "category": "Lebensmittel",
        "priority": 10,
    })

    csv_bytes = _make_csv({"description": "Amazon", "amount": "-29,99"})
    client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    )

    txns = client.get("/api/banking/transactions?owner=Paul").json()
    assert txns[0]["custom_category"] is None


def test_multiple_imports_same_owner_accumulate(client):
    client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("a.csv", io.BytesIO(_make_csv({"description": "Tx1", "booking_date": "2026-05-01"})), "text/csv")},
    )
    client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("b.csv", io.BytesIO(_make_csv({"description": "Tx2", "booking_date": "2026-05-02"})), "text/csv")},
    )
    txns = client.get("/api/banking/transactions?owner=Paul").json()
    assert len(txns) == 2


# ── Categories ────────────────────────────────────────────────────────────────

def test_get_categories_returns_list(client):
    r = client.get("/api/banking/categories")
    assert r.status_code == 200
    cats = r.json()
    assert isinstance(cats, list)
    assert len(cats) > 0


def test_get_categories_contain_expected_fields(client):
    cats = client.get("/api/banking/categories").json()
    for cat in cats:
        assert "name" in cat
        assert "type" in cat


def test_get_categories_include_default_transfer_names(client):
    """Fresh DB always seeds the Sparen/Investieren transfer categories."""
    cats = client.get("/api/banking/categories").json()
    names = {c["name"] for c in cats}
    assert "Sparen" in names
    assert "Investieren" in names


def test_create_custom_category(client):
    r = client.post("/api/banking/categories", json={
        "name": "Haustier",
        "type": "expense",
        "color": "#f00",
        "icon": "heart",
        "bucket": "guilt",
    })
    assert r.status_code == 201
    cats = client.get("/api/banking/categories").json()
    names = {c["name"] for c in cats}
    assert "Haustier" in names


# ── Rules CRUD ────────────────────────────────────────────────────────────────

def test_get_rules_empty_initially(client):
    r = client.get("/api/banking/rules")
    assert r.status_code == 200
    assert r.json() == []


def test_create_rule_appears_in_list(client):
    client.post("/api/banking/rules", json={
        "keyword": "Spotify",
        "field": "description",
        "match_type": "contains",
        "category": "Medien",
        "priority": 5,
    })
    rules = client.get("/api/banking/rules").json()
    assert len(rules) == 1
    assert rules[0]["keyword"] == "Spotify"
    assert rules[0]["category"] == "Medien"


def test_delete_rule_removes_it(client):
    client.post("/api/banking/rules", json={
        "keyword": "DeleteMe",
        "field": "description",
        "match_type": "contains",
        "category": "Andere",
        "priority": 0,
    })
    rules = client.get("/api/banking/rules").json()
    rule_id = rules[0]["id"]

    r = client.delete(f"/api/banking/rules/{rule_id}")
    assert r.status_code == 200
    assert client.get("/api/banking/rules").json() == []


def test_apply_rules_retroactively(client):
    """POST /api/banking/rules/apply re-categorizes already-imported transactions."""
    # Import first, then add rule
    csv_bytes = _make_csv({"description": "Spotify Abo", "amount": "-9,99"})
    client.post(
        "/api/banking/import?owner=Paul&bank=Tomorrow",
        files={"file": ("export.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    txns_before = client.get("/api/banking/transactions?owner=Paul").json()
    assert txns_before[0]["custom_category"] is None

    client.post("/api/banking/rules", json={
        "keyword": "Spotify",
        "field": "description",
        "match_type": "contains",
        "category": "Medien",
        "priority": 5,
    })

    r = client.post("/api/banking/rules/apply?overwrite=true")
    assert r.status_code == 200
    assert r.json()["updated"] >= 1

    txns_after = client.get("/api/banking/transactions?owner=Paul").json()
    assert txns_after[0]["custom_category"] == "Medien"
