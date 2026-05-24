# OwnFin — Developer Guide

## Current Version: 2.8.0

> **Versioning convention**: Milestone-based, not strict semver. MAJOR = significant redesign or feature epoch. MINOR = new feature. PATCH = bug fix. No external API consumers, so breaking-change semantics don't apply.

> **For Claude Code sessions (web + desktop):** This file is the shared memory between sessions. Update it whenever you make a significant architectural change, add a new table, change a key business rule, or alter an API contract. Commit it with the same PR as the change so the next session always has accurate context.

## Recent Changes (update this section with each session)

### v2.7.0 — 2026-05-23
- **Transaction dedup by ISIN**: `transaction_exists()` now matches by `(ISIN, date, price×units)` instead of `(position_id, date, units, price)`. Robust across position re-creation. Falls back to position_id if no ISIN.
- **Configurable tax rate (Phase 4)**: `capital_gains_tax_rate` field in settings (default 0.275). `routers/realized_gains.py` reads it instead of hardcoded 27.5%.
- **Configurable scheduler (Phase 4)**: `scheduler_timezone` and `scheduler_sync_time` fields in settings (defaults: `Europe/Vienna`, `20:00`). `scheduler.py` reads these on startup.
- **Retired Siemens migrations**: `_migrate_siemens_position`, `_migrate_split_siemens_smp`, `_migrate_certificate_asset_class` are now no-ops. Migration IDs remain registered so they don't re-run.
- **Neutral defaults**: `DEFAULT_SETTINGS` contains no personal dates or amounts.

### v2.6.0 — 2026-05-23
- **Own accounts config (Phase 3)**: new `own_accounts` table `(id, iban, label)`. Replaces hardcoded `_OWN_POCKET_IBANS` constant entirely.
- **Transfer detection**: CSV import now queries `own_accounts` for IBAN matching; Pockets account-type detection unchanged.
- **`GET/POST /api/banking/own-accounts`**, **`DELETE /api/banking/own-accounts/{id}`**: full CRUD.
- **GiroTab settings modal**: new Own Accounts editor — list current IBANs, add by IBAN + label, delete by row.
- No hardcoded IBANs anywhere in source code.

### v2.5.0 — 2026-05-23
- **Configurable savings phases (Phase 2)**: new `phases` table `(owner, phase_index, name, duration_months, monthly_savings)`. Last phase has `duration_months=NULL` meaning "runs to goal".
- **Migration**: existing `sp0–sp3/ph0/ph1/ph3` settings rows auto-converted to phases on first run; no data loss.
- **`GET /api/settings`** now includes `phases` array. **`POST /api/phases?owner=X`** saves 1–4 phases; non-last phases must have positive `duration_months`.
- **`calculations.py`**: `savings_for_month(m, phases)`, `ph3_boundary(phases)`, `get_phase_annotations(phases)`, `calc_projection(settings, phases, start_value)` — no more hardcoded `sp0–sp3` keys.
- **`calculations.js`**: same refactor — `spForM`, `ph3Boundary`, `phaseAnnotations`, `calcProjMonthly` all take phases list. Phase boundary labels use user-defined names instead of hardcoded German strings.
- **SettingsSheet**: `sp0–sp3/ph0/ph1/ph3` sliders replaced with dynamic phases editor (add/remove phases, name + duration + savings per phase).
- **ProjektionTab**: scenario compare overrides `phases[0]/phases[1]` monthly savings; boundary lines use user-defined names.
- **`get_phases_gemeinsam()`**: sums `monthly_savings` per phase index across all aggregate members.
- **Tests**: 112 backend, 74 frontend.

### v2.3.1 — 2026-05-23
- **Transaction delete restored**: position sheet now has a dedicated "Transaktionen" tab showing all transactions with a delete button per row. Was silently dropped during the v2.1.0 design rework. Backend `DELETE /api/transactions/{id}` already existed.
- **`repository.yaml` added**: required by HA Supervisor for valid add-on repo recognition.
- **HA repo update mechanics**: version detection = `version` in `config.json` only (no releases/tags). HA polls every 3 hours. Dev branch trackable by adding repo URL with `#dev` suffix.
- **Auto port management**: `.githooks/` added — `post-checkout`/`post-merge` auto-set port (main=8000, other=8001); `pre-push` blocks wrong port. CI `check-port` job validates on every push. Activate once per clone: `git config core.hooksPath .githooks`.

### v2.3.0 — 2026-05-22
- **`database.py` → `database/` package**: `core.py` (migrations, init_db), `portfolio.py` (positions/prices/transactions), `planning.py` (settings/checkins), `banking.py`, `broker_cash.py`, `__init__.py` (re-exports). All callers unchanged. `conftest.py` patches `database.core.DB_PATH` directly.
- **No hardcoded default positions**: `_init_defaults` and `_migrate_new_positions` are no-ops. `DEFAULT_POSITIONS` removed. Fresh installs start empty — positions created via CSV import or manually. Existing DBs unaffected.
- `DEFAULT_SETTINGS.cash` = 0 for new installs.
- **ISIN → ticker auto-lookup** (`isin_lookup.py`): queries OpenFIGI API on new position creation (CSV import + manual POST). Prefers XETRA ("GY"), falls back to any known exchange. 5s timeout; returns `None` silently on failure.
- **CI**: Node.js 20 → 24 (actions/checkout@v5, setup-node@v5, setup-python@v6, node:24-alpine in Dockerfile). Docker build check now also runs on `dev` branch pushes.
- **Tests**: 108 backend tests (was 81). New: `test_settings.py` (15), `test_broker_cash.py` (8), banking categories/rules (18 new in `test_banking.py`).

### v2.2.0 — 2026-05-22
- **New `broker_cash` table**: `(owner, broker, balance, last_import, updated_at)` — PRIMARY KEY `(owner, broker)`. Stores cash balance per broker derived from CSV imports.
- **Broker cash derivation** (`importer.py`): `parse_cash_balance(bytes) → (float|None, str|None)` sums all EUR amounts from every row in a TR/Flatex CSV using `_CASH_AMOUNT_COLS` (`gesamtbetrag`, `buchungsbetrag`, `amount`, etc.). Sign is preserved — `_parse_num` strips sign, so detection happens before calling it.
- **`GET /api/portfolio/broker_cash`**: returns `{entries: [...], total: N}` per-broker breakdown.
- **`GET /api/portfolio/summary`** `cash_value` now: reads `broker_cash` total first, falls back to `settings.cash` if no broker cash imported yet. Fully backward compatible.
- **`POST /api/transactions/import`** response now includes `broker_cash: {broker, balance}`.
- **Migration cleanup**: `_migrate_fix_kauf_verkauf_bug` and `_migrate_fix_bitpanda_sells` are no-ops — their `_run_once` IDs remain registered so they won't re-run.
- **Tests**: 81 backend tests (was 77). 4 new in `test_transactions.py` covering CSV import + broker cash.

## Branch / Port Convention

| Branch | Port | Slug | Notes |
|---|---|---|---|
| `main` | **8000** | `ownfin` | Production — `config.json` maps `"8000/tcp": 8000` |
| `dev` / feature | **8001** | `ownfin_beta` | Dev/test — installs as a separate HA add-on alongside production |

**Port is managed automatically by git hooks — you do not need to change it manually.** Hooks in `.githooks/` auto-set the port on `post-checkout` and `post-merge`, and block pushes if the port doesn't match the target branch. CI also validates this.

One-time setup per clone (already done on the primary dev machine):
```
git config core.hooksPath .githooks
```

Do **not** use `environment.PORT` — HA Supervisor ignores the `environment` field in `config.json`.

## Git Workflow

**All changes must go through pull requests — no direct pushes to any branch (including `dev`).**

- Feature/fix branches are created from `dev`, PRed into `dev` for testing, then PRed into `main`
- Every PR to `main` must include a version bump in `config.json` and a `CHANGELOG.md` entry (enforced by CI `check-release` job)
- Keep each PR to a single concern — do not mix branch-specific config changes (port, slug) with feature/fix changes

## Architecture

**Backend**: FastAPI + SQLite3 (WAL mode), APScheduler, yfinance.

**Frontend**: React 18 + Vite, Chart.js + custom SVG charts (`SvgLineChart`, `SvgDonut`).

**Deployment**: Docker container / Home Assistant OS add-on.

## Key Business Rules

- **Cash is EXCLUDED from projections and plan calculations.** `portfolio_value()` in `calculations.py` handles depot positions only. Cash balance is tracked in the `broker_cash` table (auto-derived from TR/Flatex CSV imports) and falls back to `settings.cash` (manual). The portfolio summary `cash_value` field shows it separately.
- **Multi-user**: Multiple named users plus an aggregate "Gemeinsam" view. Most endpoints accept `?owner=<username>`.
- **Phase model**: 4 savings phases (ph0–ph3) with different monthly savings rates (sp0–sp3) and duration in months.
- **Auto-checkin**: APScheduler runs price sync at 20:00 Vienna, then auto-checkin at 20:05 (separate jobs since May 2026).

## Transaction Types

| type | units | price | effect |
|---|---|---|---|
| `buy` | positive | buy price/unit | adds units + increases cost basis |
| `sell` | negative | sell price/unit | reduces units; `sale_price` col auto-captures cost basis at time of sale |
| `dividend` | 0 | total amount € | record only; excluded from IRR |
| `dividend_reinvested` | 0 | total amount € | record only; excluded from IRR |

Realized gain = `(price - sale_price) * abs(units)`. KeSt = 27.5% on gains (Austria).

## Projection Chart (ProjektionTab)

- Uses `calcProjMonthly()` from `calculations.js` — monthly resolution with `{mo, total, paid}` data points.
- X-axis uses real calendar dates (short format: "Jan '26").
- Time range filter: Finanzziel / 1J / 2J / 5J / 10J / Max.
- "Ist (Check-in)" series overlaid from `checkins[].invested` mapped to month offsets.
- Chart start = `ref_month` (settings month 0). `baseline.start_value` is the invested-only start value.

## Giro / Banking

- **CSV format**: Tomorrow Bank — `account_type,booking_date,valuta_date,sender_or_recipient,iban,booking_type,description,category,amount,currency`
- **Amount parsing**: German format with non-breaking space (U+00A0) as thousands separator. `_parse_eur()` in `banking.py` handles all variants.
- **Auto-categorization**: `bank_cat_rules` table — keyword/field/match_type/category/priority. Applied on import; retroactive via `POST /api/banking/rules/apply`.
- **Deduplication**: `imported_hash` = SHA-256(date|amount_raw|description|iban).
- Case-insensitive bank name matching: frontend sends `bank=tomorrow` (lowercase), backend normalizes.

## Sparplans

- API returns `{sparplans: [...], monthly_total: N}` — NOT a bare array. Unwrap with `sparplans?.sparplans`.
- `position_id` must reference a real position in the DB.

## Scheduler Jobs

```
20:00 Europe/Vienna — daily_price_sync  (_sync_job)
20:05 Europe/Vienna — daily_auto_checkin (_auto_checkin_job, skips if today's auto-checkin already exists)
```

## Testing

Run tests before and after any backend or logic change to catch regressions automatically.

**Backend** (108 tests):
```bash
pytest tests/ -q
```
- `tests/test_calculations.py` — 20 pure-math unit tests (projection, IRR, phase model)
- `tests/test_routers_portfolio.py` — 9 integration tests for `/api/portfolio/summary` and `/api/positions`
- `tests/test_banking.py` — 31 tests: `_parse_eur`, CSV import, dedup, categorization rules, categories CRUD, rules CRUD + retroactive apply
- `tests/test_realized_gains.py` — 11 tests: KeSt 27.5% math, gain/loss split, dividend exclusion, by-year grouping
- `tests/test_sparplans.py` — 10 tests: response envelope shape, execute unit calculation, 404 guards
- `tests/test_checkins.py` — 8 tests: upsert behavior, auto-checkin cash exclusion, Gemeinsam block
- `tests/test_transactions.py` — 9 tests: Gemeinsam guard, sell units sign enforcement, owner isolation, CSV import, broker cash
- `tests/test_settings.py` — 15 tests: GET shape, POST round-trip, Gemeinsam combined rates, shared date field sync
- `tests/test_broker_cash.py` — 8 tests: empty state, single entry, Gemeinsam aggregation, summary cash_value

**Frontend** (66 tests):
```bash
cd frontend && npm test
```
- `calculations.test.js` — `calcProjMonthly`, `calcProj`, `spForM`, `moOffset`, `phaseAnnotations`
- `utils.test.js` — formatting helpers
- `constants.test.js` — constants

**Test infrastructure**: Each test gets a fresh SQLite DB via `tmp_path`. FastAPI's `get_db` dependency is overridden; scheduler and `init_db` are patched to no-ops.

**Coverage gaps** (no tests yet): sparplans router, realized gains router, checkin router, UI behavior.

## File Map

| File | Purpose |
|---|---|
| `database/` | DB package: `core.py` (migrations, init_db), `portfolio.py`, `planning.py`, `banking.py`, `broker_cash.py` |
| `isin_lookup.py` | ISIN → Yahoo Finance ticker via OpenFIGI API |
| `calculations.py` | portfolio_value, IRR, projection |
| `scheduler.py` | APScheduler jobs |
| `routers/portfolio.py` | Summary, history, performance, benchmark, monthly-review |
| `routers/banking.py` | Accounts, transactions, categories, budgets, rules, import |
| `routers/transactions.py` | Portfolio transactions CRUD |
| `routers/realized_gains.py` | Realized G/V, KeSt calculation |
| `routers/sparplans.py` | Sparplan CRUD |
| `frontend/src/App.jsx` | Data loading, routing, user state |
| `frontend/src/tabs/UbersichtTab.jsx` | Dashboard (Hero, KPIs, chart, monthly review) |
| `frontend/src/tabs/PortfolioTab.jsx` | Portfolio views, realized gains, transaction form |
| `frontend/src/tabs/ProjektionTab.jsx` | Scenario chart, sparplan management, check-in history |
| `frontend/src/tabs/GiroTab.jsx` | Banking, rule editor, transaction feed |
| `frontend/src/calculations.js` | `calcProjMonthly`, `calcProj`, `moOffset`, helpers |
| `frontend/src/components/charts/SvgLineChart.jsx` | SVG line chart, supports `{x,y}` data points |
