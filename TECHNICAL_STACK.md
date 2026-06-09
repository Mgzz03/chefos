# ChefOS — Technical Stack & Architecture

## Project Overview
ChefOS is a **desktop kitchen management application** for recipes, inventory, costs, events, and an AI-powered assistant. It runs locally on Windows with optional mobile access (same WiFi) and cloud backup (Google Drive).

---

## 🏗️ Architecture

### Core Pattern: Desktop App (Local-First) + Serverless License
- **Frontend**: React webview (Tauri v2)
- **Backend**: FastAPI sidecar (bundled as PyInstaller executable)
- **Database**: SQLite (local, AppData/Roaming/ChefOS)
- **License**: Cloudflare Worker + KV (serverless)
- **Cloud Storage**: Google Drive (optional backup)

### Data Flow
```
User → React (Tauri webview) → FastAPI backend (127.0.0.1:8000)
                              ↓
                            SQLite DB
                              ↓
                     [License validation via Cloudflare Worker]
                              ↓
                     [Auto-backup to Google Drive]
```

---

## 📱 Frontend Stack

### Framework & Build
| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.x | UI framework |
| **Vite** | 5.x | Build tool (dev & production) |
| **React Router** | 6.x | Client-side routing |
| **Tauri** | v2.11.2 | Desktop wrapper (Rust + webview) |

### UI & Styling
| Technology | Version | Purpose |
|---|---|---|
| **CSS3** (vanilla) | native | Styling (no CSS framework) |
| **Responsive Grid/Flexbox** | native | Layout |
| **qrcode** | ^1.5 | QR code generation (mobile access) |

### State & API
| Technology | Version | Purpose |
|---|---|---|
| **fetch API** | native | HTTP requests (no Axios) |
| **localStorage** | native | Client-side settings persistence |
| **Web Audio API** | native | Voice input (mic button) |
| **FileReader API** | native | Backup file restore uploads |

### Key Frontend Files
- **App.jsx** — main entry point, license gate, global state
- **Kitchen.jsx** — dashboard + all feature pages (recipes, inventory, simulate, events, etc.)
- **MgzzAssistant.jsx** — the AI assistant chat interface
- **api.js** — backend HTTP client layer
- **styles/** — global CSS

---

## 🔧 Backend Stack

### Framework & Server
| Technology | Version | Purpose |
|---|---|---|
| **FastAPI** | 0.104+ | REST API framework (async) |
| **SQLAlchemy** | 2.x | ORM (models + migrations) |
| **Pydantic** | 2.x | Data validation & schemas |
| **Uvicorn** | 0.24+ | ASGI server |
| **Python** | 3.11+ | Runtime |

### Database
| Technology | Version | Purpose |
|---|---|---|
| **SQLite** | 3.x | Local database (AppData storage) |
| **SQLAlchemy migrations** | 2.x | Schema versioning |

### Backend Modules (Custom)
| Module | Purpose |
|---|---|
| **main.py** | 73 API endpoints (all business logic) |
| **models.py** | 18 SQLAlchemy ORM models |
| **schemas.py** | Pydantic request/response schemas |
| **database.py** | SQLAlchemy session + local/cloud mode switch |
| **license_client.py** | Hardware fingerprint + license validation |
| **gdrive.py** | Google Drive OAuth2 + backup/restore |
| **backups.py** | Daily local backup snapshots |
| **mgzzAnswer.py** | Offline AI engine (recipes + inventory analysis) |
| **bootstrap.py** | Auto-migrations on startup |
| **qa_test.py** | Integration test suite (63 tests) |
| **build_sidecar.py** | PyInstaller bundler |
| **run_server.py** | Development server launcher |

### Data Models (18 total)
Categories, Ingredients, InventoryBatch, Recipes, RecipeIngredient, Vendors, SetupItems, Events, EventRecipe, EventSetupItem, Transactions, CookedStock, Items, ItemSubRecipe, ItemIngredient, WasteLog, License, Mobile (18 tables)

### API Endpoints (73 total)
**Categories** (CRUD + delete guards), **Ingredients** (CRUD + price edit), **Inventory** (FIFO deduction, batch CRUD), **Alerts** (5 types: out/low/expired/critical/warning), **Recipes** (CRUD + cost calculation + simulate), **Cook Operations** (cook + cook-to-stock + transaction logging), **Cooked Stock** (CRUD + expiry), **Waste** (log + summary), **Items** (assemble from recipes/ingredients), **Events** (plan + cost math), **Vendors** (CRUD), **Setup Items** (CRUD), **License** (activate/validate/deactivate), **Mobile** (toggle + QR status), **Backups** (export/restore local + Google Drive), **Branding** (name/logo/margin/assistant-name)

### Key Algorithms
- **FIFO inventory deduction**: earliest-expiry stock used first
- **Recipe scaling**: linear scale by portions, ingredient cost updated
- **Event cost math**: food cost × portions + setup cost × hours
- **Profit margin**: per-recipe margin (chef-configurable) or global fallback
- **Alert logic**: stock < threshold (LOW), stock = 0 (OUT), expiry ≤ today (EXPIRED), critical threshold (CRITICAL), warnings (WARNING)

---

## 🖥️ Desktop App (Tauri)

### Framework
| Technology | Version | Purpose |
|---|---|---|
| **Tauri** | v2.11.2 | Desktop wrapper (cross-platform capable) |
| **Rust** | 1.96 (GNU) | Tauri backend language |
| **Cargo** | native | Rust package manager |

### Rust Toolchain
- **rustup** — Rust installer & version manager
- **WinLibs MinGW-w64** — GNU C++ compiler for Windows (MSVCRT ABI)
- **Tauri CLI** — build & bundle commands

### Build Artifacts
| File | Size | Purpose |
|---|---|---|
| **ChefOS.exe** | ~30 MB | Main executable (debug/release) |
| **ChefOS_1.0.0_x64-setup.exe** | 24.9 MB | NSIS installer |
| **ChefOS_1.0.0_x64_en-US.msi** | 25.5 MB | Windows MSI installer |
| **chefos-backend-x86_64-pc-windows-gnu.exe** | ~23 MB | FastAPI sidecar binary |

### Tauri Config (src-tauri/tauri.conf.json)
- App name: ChefOS
- Window: 1280×820 px
- Sidecar: auto-spawn backend on launch, auto-kill on close
- DB path: `%APPDATA%/Roaming/ChefOS/chefos.db`
- Icons: chef-hat SVG → PNG set

---

## ☁️ License & Cloud Services

### License Server
| Service | Technology | Purpose |
|---|---|---|
| **Cloudflare Workers** | JavaScript (V8 runtime) | Serverless license validation |
| **Cloudflare KV** | key-value store | Store license keys + activation records |
| **wrangler CLI** | Cloudflare tooling | Deploy Worker + manage KV |

### License Files
- **license-server/src/worker.js** — Worker code (endpoints: /activate, /validate, /deactivate, /admin/*)
- **license-server/admin.html** — Single-file admin UI (generate keys, revoke, reset devices, set expiry)
- **license-server/wrangler.toml** — Worker config

### License Logic
- **Hardware fingerprint**: MAC address + Windows MachineGuid + hostname → HMAC-SHA256 binding
- **Token encryption**: AES-256-GCM (hardware-bound, can't move to another PC)
- **Validation flow**: 30-day online re-check, 60-day offline grace period, hard block on expiry
- **Anti-piracy**: token invalid if fingerprint changes (copied to another PC)

### Google Drive Integration
| Component | Technology | Purpose |
|---|---|---|
| **OAuth2** | Python stdlib (urllib) | Loopback redirect at 127.0.0.1:53682 |
| **Google Drive REST API** | v3 | Upload/download/list backups |
| **Encryption** | AES-256-GCM | Token stored encrypted (hardware-bound) |

---

## 🔄 DevOps & Build Pipeline

### Version Control
| Tool | Purpose |
|---|---|
| **Git** | Source control (GitHub: Mgzz03/chefos) |
| **GitHub** | Remote repository + Releases (for future auto-updates) |

### Build Tools
| Tool | Version | Purpose |
|---|---|
| **Node.js** | 18+ LTS | JavaScript runtime |
| **npm** | 9+ | Node package manager |
| **Python** | 3.11+ | Backend runtime |
| **pip** | 23+ | Python package manager |
| **PyInstaller** | 6.20.0 | Freeze Python backend into .exe |
| **venv** | native | Python virtual environment |

### Build Commands
```bash
# Frontend
cd frontend
npm install
npm run build:desktop          # Vite build for desktop mode
npm run tauri build           # Tauri full build (app + installers)

# Backend
cd backend
pip install -r requirements.txt
python build_sidecar.py       # PyInstaller → sidecar binary

# License server (deploy once)
cd license-server
npm install
wrangler deploy              # Deploy to Cloudflare Workers
```

### CI/CD (Planned)
- GitHub Actions for auto-build on push
- Tauri updater for silent app updates (signing key generated, GitHub Releases as distribution)

---

## 📦 Dependencies

### Frontend (package.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router": "^6.x",
    "qrcode": "^1.5.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "@tauri-apps/cli": "^2.11.x",
    "@tauri-apps/api": "^2.x"
  }
}
```

### Backend (requirements.txt)
```
fastapi==0.104.1
uvicorn==0.24.0
sqlalchemy==2.0.x
pydantic==2.x
python-multipart==0.0.x
pyinstaller==6.20.0
google-auth-oauthlib==1.2.x
google-auth-httplib2==0.2.x
cryptography==41.x
```

### Tauri (Cargo.toml)
```toml
[dependencies]
tauri = "2.11"
tauri-build = "2.11"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

---

## 🧪 Testing & QA

### Test Suite
| File | Type | Coverage |
|---|---|---|
| **backend/qa_test.py** | Integration | 63 tests, all endpoint groups (73 routes) |
| **ESLint** | Static | 0 undefined variables, no unused imports |
| **Pydantic validation** | Schema | All request bodies validated |

### Manual Testing
- Phase 1: Static analysis (imports, dead code, schemas)
- Phase 2: Backend API (63/63 passing on fresh DB)
- Phase 3: Frontend UI (every page, click-through)
- Phase 4: Desktop app (installer, license activation, offline mode)

---

## 🔐 Security & Data Privacy

### Encryption
- **License token**: AES-256-GCM (key = hardware fingerprint)
- **Google Drive token**: AES-256-GCM (key = hardware fingerprint)
- **Backups**: stored unencrypted locally (chef's machine, under their AppData)

### Access Control
- **License activation**: required on first launch, device-locked
- **Mobile access**: off by default, LAN-only, togglable from Settings
- **Google Drive**: OAuth2 (user must authenticate once, token auto-renewed)

### Offline & Resilience
- App works **100% offline** after activation
- License checked online every 30 days; if offline for 60 days, app locks
- No internet-dependent features except backup upload
- All critical data in local SQLite (survives app reinstall)

---

## 📊 Data Models & Relationships

### Core Tables (18)
1. **categories** — ingredient categories (Produce, Dairy, etc.)
2. **ingredients** — base ingredients (name, unit, cost/unit)
3. **inventory_batches** — stock items with expiry (FIFO deduction)
4. **recipes** — dishes (name, yield, ingredients list, profit_margin)
5. **recipe_ingredients** — link recipes to ingredients (qty + unit)
6. **vendors** — suppliers (name, contact, email, phone)
7. **setup_items** — equipment rentals (name, cost/hour)
8. **events** — catering jobs (date, guest count, dishes, setup)
9. **event_recipes** — dishes in an event (qty/portions)
10. **event_setup_items** — equipment used in an event (qty, hours)
11. **transactions** — ledger of all stock changes (cook, waste, restock)
12. **cooked_stock** — finished batches (recipe, qty, expiry)
13. **items** — finished products assembled from recipes/ingredients
14. **item_sub_recipes** — link items to recipes
15. **item_ingredients** — link items to ingredients
16. **waste_log** — discarded food (source, qty, cost lost, reason)
17. **alerts** — live stock warnings (out/low/expired/critical/warning)
18. **license** — local activation token (encrypted, fingerprint-bound)

---

## 🎯 Key Features & Algorithms

### Mgzz Assistant (Offline AI)
- **Engine**: `mgzzAnswer()` function (no external API)
- **Input**: natural language query + chef's real recipes/ingredients/stock
- **Output**: structured answer (scaling, costs, shopping list, steps)
- **Examples**: "Make Pasta for 20" → scale ×5, list ingredients, cost, shopping list
- **Margin**: uses per-recipe margin (if set) or global default (80%)

### Inventory Management
- **FIFO deduction**: when cooking, earliest-expiry batch used first
- **Alerts**: 5 types (OUT, LOW, EXPIRED, CRITICAL, WARNING)
- **Batches**: each ingredient tracked by expiry date + cost snapshot

### Cost Tracking
- **Recipe cost**: sum of all ingredients (qty × unit cost)
- **Portion cost**: recipe cost ÷ base_yield
- **Event cost**: Σ(recipe cost × portions) + Σ(setup cost/hour × hours)
- **Sell price**: portion cost ÷ (1 - margin %)

### Backup System (4 layers)
1. **Auto-local**: daily snapshot to AppData/ChefOS/backups/ (last 30 kept)
2. **Export**: one-click ZIP to Desktop
3. **Restore**: pick any snapshot or ZIP file to roll back (safety copy taken first)
4. **Cloud**: Google Drive upload + auto-restore (optional, user-authenticated)

---

## 📋 Code Organization

```
chefos/
├── frontend/                     # React + Tauri
│   ├── src/
│   │   ├── App.jsx              # License gate + main layout
│   │   ├── Kitchen.jsx          # All feature pages
│   │   ├── MgzzAssistant.jsx    # AI chat interface
│   │   ├── api.js               # HTTP client
│   │   ├── styles/              # CSS
│   │   └── ...
│   ├── public/                  # Static assets (icons, logo)
│   ├── src-tauri/               # Tauri Rust config
│   │   ├── tauri.conf.json
│   │   ├── src/main.rs          # Rust entry point
│   │   └── Cargo.toml
│   └── vite.config.js
│
├── backend/                      # FastAPI
│   ├── main.py                  # 73 endpoints
│   ├── models.py                # 18 SQLAlchemy models
│   ├── schemas.py               # Pydantic schemas
│   ├── database.py              # SQLAlchemy setup
│   ├── license_client.py        # License validation
│   ├── gdrive.py                # Google Drive integration
│   ├── backups.py               # Backup system
│   ├── mgzzAnswer.py            # Offline AI engine
│   ├── bootstrap.py             # Auto-migrations
│   ├── qa_test.py               # 63 integration tests
│   ├── build_sidecar.py         # PyInstaller bundler
│   ├── requirements.txt
│   └── venv/                    # Virtual environment
│
├── license-server/              # Cloudflare Worker
│   ├── src/worker.js            # Worker code
│   ├── admin.html               # Key generation UI
│   ├── wrangler.toml            # Worker config
│   └── README.md
│
├── PROGRESS.md                  # Build progress tracking
├── CHEF_GUIDE.md                # User manual
├── TECHNICAL_STACK.md           # This file
├── CHEF-GUIDE.md                # Quick start
└── .gitignore
```

---

## 🚀 Deployment & Future Updates

### Current Deployment
- **Installer**: Windows NSIS + MSI (sent to chef as `.exe`)
- **License**: Cloudflare Worker (free tier, deployed once)
- **Backend**: bundled as sidecar (PyInstaller binary inside Tauri app)
- **Database**: local SQLite (each user has their own `chefos.db`)

### Auto-Update (Planned)
- Signing key generated (`updater-private.key`)
- New builds published to GitHub Releases
- App checks for updates on launch, silently installs (user never touched a file)

---

## 📈 Performance & Scale

### Database
- SQLite: suitable for single-user desktop (expected: 1000s of recipes/ingredients)
- Transactions logged for every cook/restock/waste event
- 30-day backup retention (auto-cleanup)
- No server scaling needed (everything local)

### API Response Times
- Recipe queries: <50ms
- Simulate (scale + cost): <100ms
- Mgzz Assistant: depends on query complexity, typically <500ms (all offline)

### Memory Usage
- Backend sidecar: ~100-200 MB (FastAPI + SQLite)
- Frontend: ~50 MB (React bundle ~320 KB gzip)
- Total app footprint: <300 MB on disk

---

## 🛠️ Development Tools & Environment

| Tool | Version | Purpose |
|---|---|---|
| **VS Code** | latest | IDE (recommended) |
| **Git** | 2.40+ | Version control |
| **PowerShell** | 5.1+ | Build automation |
| **Windows 10/11** | native | OS (app only for Windows; Tauri supports macOS/Linux) |
| **Postman / curl** | any | API testing |
| **SQLite Browser** | any | DB inspection |

---

## Summary Table

| Component | Technology | Type |
|---|---|---|
| **Desktop Shell** | Tauri v2 (Rust) | Desktop framework |
| **Frontend UI** | React 18 + Vite | JavaScript framework |
| **Backend API** | FastAPI (Python) | REST API |
| **Database** | SQLite 3 | Local SQL DB |
| **ORM** | SQLAlchemy 2 | Python ORM |
| **License** | Cloudflare Workers + KV | Serverless |
| **Backup** | Google Drive + local snapshots | Cloud + local |
| **Encryption** | AES-256-GCM | Cryptography |
| **Build** | PyInstaller + Tauri CLI | Bundling |
| **Package Managers** | npm, pip | Dependencies |
| **Testing** | pytest (stdlib) | QA |
| **Deployment** | GitHub Releases (planned) | Distribution |

---

## Compliance & Licensing Notes

- **License Keys**: CHEF-XXXX-XXXX-XXXX format, unique per device, non-transferable (hardware fingerprint binding)
- **Offline Grace**: 60 days without internet (designed for kitchen use where connectivity may be intermittent)
- **Data Ownership**: All data stored locally on chef's machine; company has no access except optional Google Drive (user controls)
- **Open Source**: No dependencies; project uses stdlib + well-known open-source libraries (FastAPI, SQLAlchemy, React, Tauri)

---

**Document Version**: 1.0 (June 2026)  
**Last Updated**: 2026-06-06  
**Project**: ChefOS Desktop Application
