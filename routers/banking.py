import csv
import hashlib
import io
import logging
from datetime import date

from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from pydantic import BaseModel
import sqlite3

import database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/banking", tags=["banking"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_eur(raw: str) -> float:
    """Parse German-format number: various European thousand/decimal formats."""
    cleaned = (
        raw.strip()
        .replace(" ", "")  # latin-1 decoded UTF-8 NBSP (shows as � + �)
        .replace("�", "")        # non-breaking space U+00A0
        .replace("\u202f", "")      # narrow no-break space
        .replace("\u00a0", "")      # unicode NBSP name
        .replace(" ", "")            # regular space
        .replace(".", "")            # period = thousands sep in DE format
        .replace(",", ".")           # comma = decimal sep
    )
    return float(cleaned)


_POCKET_ACCT_TYPE_NAME = "Pockets"

def _is_pocket_transfer(row: dict, own_ibans: set) -> bool:
    iban = (row.get("counterparty_iban") or "").strip()
    return iban in own_ibans or row.get("account_subtype") == _POCKET_ACCT_TYPE_NAME


def _make_hash(row: dict) -> str:
    src = f"{row['date']}|{row['amount_raw']}|{row.get('description','')}|{row.get('iban','')}|{row.get('account_subtype','')}"
    return hashlib.sha256(src.encode()).hexdigest()


# ── Models ────────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str
    account_type: str = "checking"
    owner: str
    bank: str = "Tomorrow"
    iban: str | None = None
    currency: str = "EUR"


class TxPatch(BaseModel):
    custom_category: str | None = None
    split_ratio: float | None = None
    notes: str | None = None
    is_transfer: bool | None = None


class CategoryPatch(BaseModel):
    type: str
    color: str
    icon: str
    split_default: float = 1.0
    bucket: str = 'guilt'


class BudgetUpsert(BaseModel):
    category: str
    owner: str
    month: str   # YYYY-MM or 'template'
    amount: float
    is_template: bool = False


class CategoryCreate(BaseModel):
    name: str
    type: str = "expense"
    color: str = "#6b7280"
    icon: str = "💳"
    split_default: float = 1.0
    bucket: str = 'guilt'


class CatRuleUpsert(BaseModel):
    keyword: str
    field: str = "description"
    match_type: str = "contains"
    category: str
    priority: int = 0


# ── Own Accounts (own IBANs for transfer detection) ───────────────────────────

class OwnAccountCreate(BaseModel):
    iban: str
    label: str = ""


@router.get("/own-accounts")
def list_own_accounts(db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_own_accounts(db)


@router.post("/own-accounts", status_code=201)
def create_own_account(
    body: OwnAccountCreate,
    db: sqlite3.Connection = Depends(database.get_db),
):
    aid = database.add_own_account(db, body.iban, body.label)
    return {"id": aid}


@router.delete("/own-accounts/{account_id}", status_code=204)
def remove_own_account(
    account_id: int,
    db: sqlite3.Connection = Depends(database.get_db),
):
    database.delete_own_account(db, account_id)


# ── Accounts ──────────────────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    accounts = database.get_bank_accounts(db, owner=owner)
    result = []
    for acc in accounts:
        balance = db.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM bank_transactions WHERE account_id=?",
            (acc["id"],),
        ).fetchone()[0]
        result.append({**acc, "balance": round(balance, 2)})
    return result


@router.post("/accounts", status_code=201)
def create_account(
    body: AccountCreate,
    db: sqlite3.Connection = Depends(database.get_db),
):
    aid = database.create_bank_account(db, body.model_dump())
    return {"id": aid}


# ── Transactions ──────────────────────────────────────────────────────────────

@router.get("/transactions")
def list_transactions(
    owner: str = Query(...),
    account_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    category: str | None = Query(None),
    search: str | None = Query(None),
    include_transfers: bool = Query(True),
    limit: int = Query(0),
    offset: int = Query(0),
    db: sqlite3.Connection = Depends(database.get_db),
):
    txs = database.get_bank_transactions(
        db,
        account_id=account_id,
        owner=owner,
        from_date=from_date,
        to_date=to_date,
        category=category,
        search=search,
        include_transfers=include_transfers,
        limit=limit,
        offset=offset,
    )
    for tx in txs:
        tx["effective_category"] = tx.get("custom_category") or tx.get("original_category") or "Andere"
    return txs


@router.patch("/transactions/{tx_id}")
def patch_transaction(
    tx_id: int,
    body: TxPatch,
    db: sqlite3.Connection = Depends(database.get_db),
):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    database.update_bank_transaction(db, tx_id, data)
    return {"ok": True}


@router.delete("/transactions/{tx_id}")
def remove_transaction(
    tx_id: int,
    db: sqlite3.Connection = Depends(database.get_db),
):
    database.delete_bank_transaction(db, tx_id)
    return {"ok": True}


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_bank_categories(db)


@router.post("/categories", status_code=201)
def create_category(
    body: CategoryCreate,
    db: sqlite3.Connection = Depends(database.get_db),
):
    data = body.model_dump()
    name = data.pop("name")
    database.upsert_bank_category(db, name, data)
    return {"ok": True, "name": name}


@router.patch("/categories/{name}")
def update_category(
    name: str,
    body: CategoryPatch,
    db: sqlite3.Connection = Depends(database.get_db),
):
    database.upsert_bank_category(db, name, body.model_dump())
    return {"ok": True}


@router.patch("/categories/{name}/bucket")
def update_category_bucket(
    name: str,
    bucket: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    database.set_category_bucket(db, name, bucket)
    return {"ok": True}


# ── Auto-categorization rules ─────────────────────────────────────────────────

@router.get("/rules")
def list_rules(db: sqlite3.Connection = Depends(database.get_db)):
    return database.get_cat_rules(db)


@router.post("/rules", status_code=201)
def create_rule(body: CatRuleUpsert, db: sqlite3.Connection = Depends(database.get_db)):
    database.upsert_cat_rule(db, body.keyword, body.field, body.match_type, body.category, body.priority)
    return {"ok": True}


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: CatRuleUpsert, db: sqlite3.Connection = Depends(database.get_db)):
    database.upsert_cat_rule(db, body.keyword, body.field, body.match_type, body.category, body.priority, rule_id=rule_id)
    return {"ok": True}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: sqlite3.Connection = Depends(database.get_db)):
    database.delete_cat_rule(db, rule_id)
    return {"ok": True}


@router.post("/rules/apply")
def apply_rules(
    overwrite: bool = Query(False),
    db: sqlite3.Connection = Depends(database.get_db),
):
    updated = database.apply_cat_rules_to_all(db, overwrite=overwrite)
    return {"updated": updated}


# ── Budgets ───────────────────────────────────────────────────────────────────

@router.get("/budgets/templates")
def get_budget_templates(
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    return database.get_bank_budget_templates(db, owner=owner)


@router.get("/budgets")
def get_budgets(
    month: str = Query(...),
    owner: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    # get_bank_budgets now merges month-specific + templates
    budgets = database.get_bank_budgets(db, month=month, owner=owner)
    budget_map = {b["category"]: b for b in budgets}

    from_date = f"{month}-01"
    import calendar
    y, m = map(int, month.split("-"))
    last_day = calendar.monthrange(y, m)[1]
    to_date = f"{month}-{last_day:02d}"

    txs = database.get_bank_transactions(
        db, owner=owner, from_date=from_date, to_date=to_date, include_transfers=False
    )
    spent_map: dict = {}
    for tx in txs:
        cat = tx.get("custom_category") or tx.get("original_category") or "Andere"
        if tx["amount"] < 0:
            spent_map[cat] = spent_map.get(cat, 0.0) + abs(tx["amount"] * tx.get("split_ratio", 1.0))

    result = []
    for cat, b in budget_map.items():
        result.append({
            "category": cat,
            "budget": b["amount"],
            "spent": round(spent_map.get(cat, 0), 2),
            "is_template": b.get("is_template", False),
        })
    return result


@router.put("/budgets")
def set_budget(
    body: BudgetUpsert,
    db: sqlite3.Connection = Depends(database.get_db),
):
    # If is_template=True, store with month='template' regardless of body.month
    effective_month = "template" if body.is_template else body.month
    database.upsert_bank_budget(db, body.category, body.owner, effective_month, body.amount)
    return {"ok": True}


# ── Cashflow ──────────────────────────────────────────────────────────────────

@router.get("/cashflow")
def cashflow(
    owner: str = Query(...),
    months: int = Query(12),
    db: sqlite3.Connection = Depends(database.get_db),
):
    return database.get_bank_cashflow(db, owner=owner, months=months)


# ── Category Breakdown ────────────────────────────────────────────────────────

@router.get("/breakdown")
def category_breakdown(
    owner: str = Query(...),
    month: str = Query(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    import calendar
    y, m = map(int, month.split("-"))
    last_day = calendar.monthrange(y, m)[1]
    txs = database.get_bank_transactions(
        db,
        owner=owner,
        from_date=f"{month}-01",
        to_date=f"{month}-{last_day:02d}",
        include_transfers=False,
    )
    cats: dict = {}
    for tx in txs:
        cat = tx.get("custom_category") or tx.get("original_category") or "Andere"
        amt = tx["amount"] * tx.get("split_ratio", 1.0)
        if cat not in cats:
            cats[cat] = {"income": 0.0, "expenses": 0.0}
        if amt > 0:
            cats[cat]["income"] += amt
        else:
            cats[cat]["expenses"] += abs(amt)

    result = [
        {"category": cat, "income": round(v["income"], 2), "expenses": round(v["expenses"], 2)}
        for cat, v in sorted(cats.items(), key=lambda x: -x[1]["expenses"])
    ]
    return result


# ── Import ────────────────────────────────────────────────────────────────────

def _parse_tomorrow_csv(content: bytes, owner: str, own_ibans: set | None = None) -> tuple[list[dict], list[str], int]:
    """Returns (parsed_rows, errors, total_rows_attempted)."""
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows, errors = [], []
    total_attempted = 0

    for i, row in enumerate(reader, start=2):
        total_attempted += 1
        try:
            amount = _parse_eur(row["amount"])
        except (ValueError, KeyError) as e:
            errors.append(f"Zeile {i}: Betrag unlesbar ({row.get('amount','')!r}) — {e}")
            continue

        raw_amount = row.get("amount", "")
        acct_subtype = row.get("account_type", "Hauptkonto")
        h = _make_hash({
            "date": row.get("booking_date", ""),
            "amount_raw": raw_amount,
            "description": row.get("description", ""),
            "iban": row.get("iban", ""),
            "account_subtype": acct_subtype,
        })
        counterparty_iban = (row.get("iban") or "").strip()

        is_transfer = int(_is_pocket_transfer(
            {"account_subtype": acct_subtype, "counterparty_iban": counterparty_iban},
            own_ibans or set(),
        ))

        rows.append({
            "account_subtype": acct_subtype,
            "date": row.get("booking_date", "").strip(),
            "amount": amount,
            "amount_raw": raw_amount,
            "description": (row.get("description") or "").strip(),
            "counterparty": (row.get("sender_or_recipient") or "").strip(),
            "counterparty_iban": counterparty_iban,
            "booking_type": (row.get("booking_type") or "").strip(),
            "original_category": "Sparen" if is_transfer else (row.get("category") or "Andere").strip(),
            "is_transfer": is_transfer,
            "split_ratio": 1.0,
            "imported_hash": h,
            "owner": owner,
        })

    return rows, errors, total_attempted


@router.post("/import")
async def import_transactions(
    owner: str = Query(...),
    bank: str = Query("Tomorrow"),
    file: UploadFile = File(...),
    db: sqlite3.Connection = Depends(database.get_db),
):
    content = await file.read()
    if bank.lower() != "tomorrow":
        raise HTTPException(400, f"Bank '{bank}' noch nicht unterstützt")

    own_ibans = database.get_own_account_ibans(db)
    rows, errors, total_attempted = _parse_tomorrow_csv(content, owner=owner, own_ibans=own_ibans)
    if not rows and errors:
        return {"imported": 0, "skipped": 0, "errors": errors, "total_rows": total_attempted}

    # Auto-detect Gemeinsam: Partner*innenkonto rows belong to the shared account
    if any(r["account_subtype"] == "Partner*innenkonto" for r in rows):
        owner = "Gemeinsam"
        for r in rows:
            r["owner"] = "Gemeinsam"

    # Find or create accounts for each account_subtype present in the CSV
    acct_subtypes = {r["account_subtype"] for r in rows}
    acct_map: dict = {}
    for subtype in acct_subtypes:
        acct_name = f"Tomorrow {subtype}"
        existing = db.execute(
            "SELECT id FROM bank_accounts WHERE name=? AND owner=?",
            (acct_name, owner),
        ).fetchone()
        if existing:
            acct_map[subtype] = existing["id"]
        else:
            acct_type = "pocket" if subtype == "Pockets" else "checking"
            acct_map[subtype] = database.create_bank_account(db, {
                "name": acct_name,
                "account_type": acct_type,
                "owner": owner,
                "bank": bank,
                "iban": None,
                "currency": "EUR",
            })

    rules = database.get_cat_rules(db)
    imported, skipped = 0, 0
    skip_details = []
    for r in rows:
        auto_cat = database.apply_cat_rule_to_tx(rules, r) if rules else None
        tx_data = {
            "account_id": acct_map[r["account_subtype"]],
            "date": r["date"],
            "amount": r["amount"],
            "description": r["description"],
            "counterparty": r["counterparty"],
            "counterparty_iban": r["counterparty_iban"],
            "booking_type": r["booking_type"],
            "original_category": r["original_category"],
            "custom_category": auto_cat,
            "is_transfer": r["is_transfer"],
            "split_ratio": r["split_ratio"],
            "imported_hash": r["imported_hash"],
        }
        result = database.upsert_bank_transaction(db, tx_data)
        if result is None:
            skipped += 1
            skip_details.append(f"{r['date']} / {r['amount_raw']}: Bereits vorhanden")
        else:
            imported += 1

    db.commit()
    logger.info("Banking import: %d imported, %d skipped, %d parse errors, total_rows=%d", imported, skipped, len(errors), total_attempted)
    return {"imported": imported, "skipped": skipped, "errors": errors, "skip_details": skip_details, "total_rows": total_attempted}
