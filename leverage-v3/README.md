# LEVERAGE v3
**Elite Procurement AI Operating System** — A&M PEPI Commercial Operations

---

## Quick Start (Windows)

```bat
# 1. Clone / unzip to a folder
# 2. Fill in .env (see below)
# 3. Double-click start.bat  — or run from terminal:
start.bat
```

Opens two windows: Node server (port 5000) + Python sidecar (port 5001).  
Navigate to **http://localhost:5000**

---

## Environment Setup

Edit `.env` in the project root. All keys with values are already filled in.  
You only need to add two:

```env
ANTHROPIC_API_KEY=sk-ant-...    # Required — Claude co-pilot, deliverables, extraction
FRED_API_KEY=...                 # Required — Macro/PPI market data (free at fred.stlouisfed.org)
```

Everything else degrades gracefully if not set:
| Key | Effect if missing |
|-----|-------------------|
| `EIA_API_KEY` | Energy prices fall back to yfinance |
| `NEWSDATA_API_KEY` | News falls back to DDGS |
| `SERPER_API_KEY` | Search skips Google reserve tier |
| `EXA_API_KEY` | Category briefs skip competitor supplier research |
| `USITC_API_KEY` | Tariff lookup uses static engine rates |
| `SAM_API_KEY` | SAM.gov debarment check is skipped |

---

## Manual Start

```bat
# Terminal 1 — Node server
npm install
npm run dev

# Terminal 2 — Python sidecar
cd python-sidecar
pip install -r requirements.txt --break-system-packages
python main.py
```

---

## Optional: SearXNG (Tier 1 search, unlimited, $0)

```bat
docker run -d -p 8888:8080 --name searxng searxng/searxng
```

Set `SEARXNG_URL=http://localhost:8888` in `.env` (already default).

---

## Optional: Redis (BullMQ job queue)

Without Redis, all agent jobs run inline (works fine for dev).  
With Redis, jobs are queued, retried, and can run concurrently.

Windows: https://redis.io/docs/getting-started/installation/install-redis-on-windows/

```bat
redis-server
```

---

## Architecture

```
leverage-v3/
├── server/
│   ├── index.ts          — Express entry point, job handler registration
│   ├── routes.ts         — All ~80 API routes
│   ├── storage.ts        — SQLite + Drizzle ORM, schema migrations
│   ├── engines/          — Scoring, Kraljic, financial model, tariffs, benchmarks
│   └── services/         — 13 v3 services
│       ├── AlertService.ts
│       ├── CategoryBriefService.ts
│       ├── ContractExtractionService.ts
│       ├── CopilotService.ts
│       ├── DeliverableService.ts
│       ├── FxService.ts
│       ├── JobQueueService.ts
│       ├── MarketDataService.ts
│       ├── NewsService.ts
│       ├── PortfolioService.ts
│       ├── SanctionsService.ts
│       ├── TariffLookupService.ts
│       └── WebSearchService.ts
├── client/src/
│   ├── App.tsx            — Routing (26 pages)
│   ├── components/        — Layout, Copilot panel, UI primitives
│   └── pages/             — All 26 pages
├── shared/
│   └── schema.ts          — 28 Drizzle table definitions
├── python-sidecar/
│   ├── main.py            — FastAPI on port 5001
│   └── requirements.txt
├── .env                   — API keys (do not commit)
├── data.db                — SQLite database (auto-created)
└── generated/             — Generated PPTX/DOCX/XLSX files
```

---

## Pages

| URL | Page |
|-----|------|
| `/` | Engagement list |
| `/new-engagement` | Create engagement |
| `/portfolio` | MD Portfolio Command Center |
| `/portal/:id` | Read-only PE sponsor portal |
| `/market-intel` | Live commodity + macro data |
| `/engagements/:id/dashboard` | Engagement dashboard |
| `/engagements/:id/import` | Data import |
| `/engagements/:id/cleansing` | Data cleansing |
| `/engagements/:id/categorization` | Spend categorization |
| `/engagements/:id/analysis` | Spend analysis |
| `/engagements/:id/spend-flags` | Spend flags |
| `/engagements/:id/tariff-impact` | Tariff impact |
| `/engagements/:id/modeling` | Savings modeling |
| `/engagements/:id/assumptions` | Assumptions library |
| `/engagements/:id/category-strategy` | Kraljic + category strategy |
| `/engagements/:id/contracts` | Contract register |
| `/engagements/:id/contract-upload` | Contract AI extraction |
| `/engagements/:id/100-day-plan` | 100-day implementation plan |
| `/engagements/:id/tracker` | Savings tracker |
| `/engagements/:id/cashflow` | Cash flow phasing |
| `/engagements/:id/financial-model` | NPV/IRR + EBITDA bridge |
| `/engagements/:id/maturity` | Procurement maturity |
| `/engagements/:id/supplier-risk` | Supplier risk dashboard |
| `/engagements/:id/market-intel` | Market intelligence (per engagement) |
| `/engagements/:id/fx-exposure` | FX exposure analysis |
| `/engagements/:id/deliverables` | One-click deliverable generation |
| `/engagements/:id/alerts` | Alert center |

---

## Job Types

| Job | Trigger | What it does |
|-----|---------|-------------|
| `contract_extract` | Contract upload | PDF/DOCX → Claude extraction → contract row |
| `news_scan` | Manual / nightly | NewsData.io → Trafilatura → Claude risk classification |
| `deliverable_gen` | Generate button | Assemble data → Claude narrative → PPTX/DOCX/XLSX |
| `sanctions_scan` | Manual | OFAC SDN + SAM.gov + SEC EDGAR screening |
| `alert_scan` | Manual / nightly | Commodity spikes + savings-at-risk detection |
| `portfolio_snapshot` | Manual / nightly | Cross-engagement KPI rollup → portfolio_snapshots |
| `tariff_lookup` | Manual | USITC live HTS rates vs. static, delta flagging |
| `category_brief` | Per-category button | Exa.ai + Claude → 1-page Word category brief |

---

## Database

SQLite at `./data.db`. Schema auto-migrates on startup.  
28 tables across 3 schema versions (v3 is current).

To reset: `del data.db` — will reseed from scratch on next start.

---

## LEVERAGE v3 · A&M PEPI Procurement Practice · Confidential
