# OwnFin

A self-hosted personal finance dashboard with portfolio tracking, savings projection, bank transaction analysis, and automatic price sync. Runs as a Docker container — built for Home Assistant OS but works standalone.

**Stack:** Python 3.12 · FastAPI · SQLite (WAL) · yfinance · APScheduler · React 18 · Vite · Chart.js

---

## Features

### Dashboard
- Total wealth (portfolio + cash), progress toward savings goal, ahead/behind plan
- KPIs: simple return, IRR, active monthly savings rate, MSCI World CAGR benchmark
- 6-month portfolio chart, phase timeline, monthly review card
- Auto check-in notification when no manual check-in for a while

### Portfolio
- Performance chart with time-range filter (1M / 3M / 6M / 1Y / All) and MSCI World comparison
- Allocation donut: actual vs. target weights
- Position list with units, current price, value, return
- Position detail: price history, transaction log, edit weight/ticker/notes
- Realized gains/losses with configurable capital gains tax rate
- Rebalancing suggestion: deviation from target weight in €
- Transaction entry: buy, sell, dividend (paid / reinvested)
- CSV import for broker statements (Trade Republic, Flatex, Bitpanda, generic)

### Savings Projection
- Monthly projection chart with configurable savings phases (1–4 phases, each with a name, duration, and monthly savings amount; last phase runs to goal)
- Scenario comparison: overlay two alternative savings rates
- Phase boundary annotations with user-defined labels
- Check-in history overlaid on projection

### Banking (Giro)
- Bank transaction import (Tomorrow Bank CSV)
- Auto-categorization with keyword rules (contains / exact / startswith)
- 4-bucket spending analysis: Fixed · Invest · Goals · Discretionary
- Monthly cashflow chart, budget templates, category breakdown
- Own accounts manager: add your IBANs so imports auto-detect internal transfers

### Multi-user
- Multiple users with separate portfolios and settings
- Aggregate view sums savings rates and goals across users
- Shared timeline fields stay in sync across users
- First-run setup wizard on fresh install

---

## Installation

### Home Assistant OS (add-on)

1. **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add: `https://github.com/YOUR_USERNAME/finance_tracker`
3. Install **Finance Tracker**, configure the port mapping, start

Data persists in `/data/dashboard.db` on the HA data volume.

### Docker (standalone)

```bash
docker build -t finance-tracker .
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/data:/data \
  --name finance-tracker \
  finance-tracker
```

Open `http://localhost:8000`. The setup wizard runs on first start.

### Local development

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend dev server runs on `:5173` and proxies API calls to `:8001`.

```bash
# Tests
pytest tests/ -q          # 112 backend tests
cd frontend && npm test   # 74 frontend tests
```

---

## Configuration

All settings are in the app's Settings panel:

| Setting | Default | Description |
|---|---|---|
| Savings goal | 100,000 | Target portfolio value |
| Reference month | — | Month 0 of the projection |
| Return rate | 6.5% | Expected annual return during accumulation |
| Capital gains tax | 27.5% | Applied to realized gains |
| Scheduler timezone | Europe/Vienna | Timezone for daily price sync |
| Scheduler sync time | 20:00 | Time of daily price sync |

Savings phases are configured per user — each has a name, duration in months, and monthly savings amount. The last phase runs until the goal is reached.

---

## Data & Privacy

- **Database:** SQLite at `/data/dashboard.db` (WAL mode, stays on your server)
- **Price data:** Yahoo Finance via `yfinance` (ticker lookups only)
- **ISIN lookup:** OpenFIGI API (on new position creation, to find the Yahoo ticker)
- No analytics, no telemetry, no accounts

---

## License

MIT
