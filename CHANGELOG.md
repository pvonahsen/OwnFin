# Changelog

All notable changes to OwnFin are documented here.

---

## [2.9.0] — 2026-05-25

### Added
- **Adjustable aurora/background intensity** — 0–100% slider in Settings → Appearance (default 20%). Stored in `localStorage`. Gradient isolated to `::before` pseudo-element so the saturation filter doesn't bleed into UI content.
- **Phase end dates as calendar pickers** — settings phase editor now shows a `type="month"` picker for each non-last phase instead of a raw "Duration (months)" number input. Converts to `duration_months` on save; data model unchanged.
- **Multi-file CSV import** — both the bank (GiroTab) and portfolio (PortfolioTab) import sheets now accept multiple files at once. Files are POSTed sequentially; results are aggregated.
- **Backfill historical prices button** — added to Settings → Price data; triggers `POST /api/prices/backfill` (last 2 years).

### Fixed
- **Phase timeline in Overview** — was reading old `ph0/sp0` settings keys (no longer written); now reads `settings.phases` array correctly.
- **Tab persistence** — active tab is saved to `localStorage` and restored on page reload.
- **Portfolio sort by value** — position list now sorts by current market value (descending) by default.
- **Projections null crash** — `moOffset()` returns `NaN` for null args; prevents TypeError on fresh install before `ref_month` is set.
- **Broker cash balance for partial exports** — `parse_cash_balance()` now prefers a running-balance column (`Saldo nach Buchung` etc.) over summing transaction amounts. Fixes Flatex partial-history imports that previously produced wrong (too-low) balances. Fallback to summation preserved for Trade Republic full-history exports.

---

## [2.8.1] — 2026-05-24

### Fixed
- `currentPhaseMo()` crash (`TypeError: can't access property "split"`) on fresh install when `ref_month` is not yet configured in Settings

---

## [2.8.0] — 2026-05-24

### Added
- `CHANGELOG.md` — release history surfaced in HA Supervisor add-on info tab
- `logo.png` — add-on icon (512×512)
- Updated CI: `check-port` job now validates port in both `run.sh` and `config.json`
- New `check-release` CI job blocks any PR to `main` that is missing a version bump in `config.json` or an update to `CHANGELOG.md`

### Fixed
- `config.json` slug corrected from `finance_tracker` → `ownfin`
- `main` branch port restored to 8000 in both `run.sh` and `config.json`

---

## [2.7.0] — 2026-05-23

### Added
- **Transaction dedup by ISIN**: `transaction_exists()` now matches by `(ISIN, date, price×units)` — robust across position re-creation; falls back to `position_id` if no ISIN is set
- **Configurable tax rate**: `capital_gains_tax_rate` field in settings (default 0.275); `routers/realized_gains.py` reads it instead of hardcoded 27.5%
- **Configurable scheduler**: `scheduler_timezone` and `scheduler_sync_time` fields in settings (defaults: `Europe/Vienna`, `20:00`); `scheduler.py` reads these on startup

### Changed
- Retired Siemens-specific migration helpers (`_migrate_siemens_position`, `_migrate_split_siemens_smp`, `_migrate_certificate_asset_class`) — now no-ops; IDs remain registered
- `DEFAULT_SETTINGS` contains no personal dates or amounts

---

## [2.6.0] — 2026-05-23

### Added
- **Own accounts config**: new `own_accounts` table `(id, iban, label)`; replaces hardcoded `_OWN_POCKET_IBANS` constant
- **`GET/POST /api/banking/own-accounts`** and **`DELETE /api/banking/own-accounts/{id}`** — full CRUD
- GiroTab settings modal: Own Accounts editor (list, add by IBAN + label, delete by row)

### Changed
- CSV import transfer detection queries `own_accounts` table instead of hardcoded IBANs

---

## [2.5.0] — 2026-05-23

### Added
- **Configurable savings phases**: new `phases` table `(owner, phase_index, name, duration_months, monthly_savings)`; last phase has `duration_months=NULL` (runs to goal)
- **`POST /api/phases?owner=X`** — save 1–4 phases with validation
- **`GET /api/settings`** now includes `phases` array
- SettingsSheet: dynamic phases editor replaces hardcoded `sp0–sp3/ph0/ph1/ph3` sliders

### Changed
- `calculations.py`: `savings_for_month`, `ph3_boundary`, `get_phase_annotations`, `calc_projection` all accept phases list
- `calculations.js`: `spForM`, `ph3Boundary`, `phaseAnnotations`, `calcProjMonthly` all accept phases list
- Phase boundary labels use user-defined names instead of hardcoded German strings
- ProjektionTab scenario compare overrides `phases[0]/phases[1]` monthly savings

### Migrated
- Existing `sp0–sp3/ph0/ph1/ph3` settings rows auto-converted to phases on first run

---

## [2.3.1] — 2026-05-23

### Added
- **Transaction delete UI restored**: position sheet "Transaktionen" tab lists all transactions with a per-row delete button (backend `DELETE /api/transactions/{id}` already existed)
- `repository.yaml` — required by HA Supervisor for valid add-on repo recognition
- `.githooks/` — `post-checkout`/`post-merge` auto-set port; `pre-push` blocks wrong port
- CI `check-port` job validates port on every push

### Notes
- HA version detection uses `version` field in `config.json` only (no GitHub releases/tags)
- Dev branch trackable by adding repo URL with `#dev` suffix

---

## [2.3.0] — 2026-05-22

### Added
- **ISIN → ticker auto-lookup** (`isin_lookup.py`): queries OpenFIGI API on new position creation; prefers XETRA ("GY"), falls back to any known exchange
- `database/` package: `core.py`, `portfolio.py`, `planning.py`, `banking.py`, `broker_cash.py`, `__init__.py`

### Changed
- `_init_defaults` and `_migrate_new_positions` are no-ops — fresh installs start empty
- `DEFAULT_SETTINGS.cash` = 0 for new installs
- CI: Node.js 20 → 24 (`actions/checkout@v5`, `setup-node@v5`, `setup-python@v6`, `node:24-alpine`)
- Docker build check runs on `dev` branch pushes as well

### Tests
- 108 backend tests (was 81): new `test_settings.py` (15), `test_broker_cash.py` (8), banking categories/rules (18)
