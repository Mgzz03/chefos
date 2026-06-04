# ChefOS — Desktop App Progress

Tracking the move from the cloud (Supabase/Vercel/Render) approach to a **local
desktop `.exe`** with license activation, LAN access, and backups.

Architecture decision: **pure local**. The desktop build talks straight to a
bundled FastAPI backend over `127.0.0.1`, stores data in SQLite under
`AppData/Roaming/ChefOS`, and uses **no cloud login** — the license key is the
gate. The old cloud code still exists in git history if ever needed.

---

## ✅ STEP 1 — Package as a desktop app with Tauri  (BUILT — awaiting your build/test)

**Done & verified by me (no Rust needed for these checks):**
- Backend reverted to **local mode**: SQLite, no login token required.
  - `CHEFOS_LOCAL=1` forces SQLite and bypasses the Supabase JWT gate.
  - DB path comes from `CHEFOS_DB_PATH` (Tauri points it at AppData).
  - ✔ Verified: backend boots, `/health` → `{"ok":true}`, GET/POST work with **no auth token**.
  - ✔ Verified: existing old `chefos.db` (no `user_id` column) auto-migrates on
    startup — 8 existing rows preserved, `user_id` backfilled to `local`.
- Frontend reverted to local mode behind a single `VITE_LOCAL_MODE` flag:
  - No login screen, no Supabase client created, no Realtime, JWT interceptor off.
  - Waits for the bundled backend's `/health` before first load.
  - ✔ Verified: `vite build --mode desktop` succeeds, PWA service-worker disabled
    (it breaks inside a native webview), code-split chunks intact.
- **Tauri v2 scaffold** created in `frontend/src-tauri/`:
  - Spawns the FastAPI backend as a **sidecar** on launch (silent, background).
  - Sets the DB path to `AppData/Roaming/ChefOS/chefos.db` (survives updates/uninstall).
  - **Kills the backend cleanly** when the window closes.
  - App name **ChefOS**, 1280×820 window.
- Sidecar build pipeline: `backend/build_sidecar.py` (PyInstaller → correct
  Tauri target-triple filename).

**Tier 2 (real .exe) — ✅ DONE. Installer built.**
- ✔ PyInstaller; backend frozen into `chefos-backend-*.exe`, verified running standalone.
- ✔ Tauri CLI 2.11.2; app icons (chef-hat) generated.
- ✔ Toolchain: **Rust 1.96 GNU** (`stable-x86_64-pc-windows-gnu`) + **WinLibs MinGW-w64**
  (MSVCRT). MSVC Build Tools could NOT be installed headlessly (GUI installer dies),
  so we use the GNU toolchain instead.
- ✔ Built artifacts:
  - `src-tauri/target/release/ChefOS.exe`
  - `src-tauri/target/release/bundle/msi/ChefOS_1.0.0_x64_en-US.msi`
  - `src-tauri/target/release/bundle/nsis/ChefOS_1.0.0_x64-setup.exe`

### ⚙️ How to rebuild the .exe (IMPORTANT for future steps)
The machine has **McAfee + Reason Cybersecurity**, which block the compiler. Folder
exclusions were added for: `C:\Users\Asus\.rustup`, `.cargo`,
`AppData\Local\Microsoft\WinGet\Packages`, and `C:\chefos`. Keep those exclusions.

To rebuild (e.g. after Steps 2–4 change code):
```
# 1. rebuild the backend sidecar (names itself for the active rust target = -gnu)
cd C:\chefos\backend
.\venv\Scripts\python.exe build_sidecar.py
# 2. build the app (WinLibs + cargo must be on PATH — both are on the user PATH now)
cd C:\chefos\frontend
npm run tauri build
```
If a build fails with `collect2 / Access is denied / CreateProcess`, the AV is
interfering again — confirm the exclusions are still active (or pause real-time).

**Skipped / notes:**
- Mac `.dmg` supported by the same config but can only be built *on a Mac*.

---

## ✅ STEP 2 — License key activation (Cloudflare Worker + KV)   — BUILT & TESTED
All four parts built and **verified end-to-end against a local `wrangler dev`**:
- **License server** `license-server/src/worker.js` (Cloudflare Worker + KV):
  `/activate`, `/validate`, `/deactivate`, admin `/admin/*`. Signs HS256 tokens.
  ✔ Tested: generate key, activate, idempotent re-activate, device-limit enforced,
  invalid key → 404, admin auth, revoke → app locks on next check.
- **Admin page** `license-server/admin.html` — single file: generate keys, see
  active devices, revoke/enable, set expiry, reset devices, delete.
- **Backend client** `backend/license_client.py` (stdlib only): hardware
  fingerprint (MAC + Windows MachineGuid + host), encrypted+HMAC local token bound
  to the fingerprint, 30-day online re-check, 60-day offline grace.
  Endpoints in main.py: `/license/status`, `/license/activate`, `/license/deactivate`.
  ✔ Tested: full backend→Worker activate/status/deactivate chain; a token copied to
  a different fingerprint fails to open (anti-piracy).
- **Activation screen** in `App.jsx` — gates the local app until activated
  (auto-formats `CHEF-XXXX-XXXX-XXXX`); **Settings page** added with a
  "Deactivate this device" button + license info.

### 🚀 What YOU need to do to turn Step 2 on
1. Deploy the Worker — follow **`license-server/README.md`** (free Cloudflare
   account → `wrangler kv namespace create` → set `JWT_SECRET` + `ADMIN_TOKEN`
   secrets → `wrangler deploy`). You get a URL like
   `https://chefos-license.<you>.workers.dev`.
2. Open `license-server/admin.html`, connect with that URL + your `ADMIN_TOKEN`,
   and **Generate** a key for the chef.
3. Rebuild the app with the URL baked in:
   ```
   # PowerShell, before the build:
   $env:CHEFOS_LICENSE_URL = "https://chefos-license.<you>.workers.dev"
   cd C:\chefos\backend;  .\venv\Scripts\python.exe build_sidecar.py
   cd C:\chefos\frontend; npm run tauri build
   ```
   (For Tier-1 dev testing, just set `$env:CHEFOS_LICENSE_URL` before
   `run_server.py` — no rebuild needed.)
4. Launch ChefOS → activation screen → paste the key → it activates and never
   asks again on that device.

## ✅ STEP 3 — Same-WiFi mobile access   — BUILT & TESTED
The backend serves the built frontend over the LAN so a phone/tablet on the same
WiFi can use ChefOS. **OFF by default; access-controlled, not just hidden.**
- Backend binds `0.0.0.0`; a middleware **refuses any non-local client unless
  Mobile Access is enabled** (so turning it off truly locks out the LAN).
- `/mobile/status` (auto-detects LAN IP + port + url), `/mobile/toggle`.
- Frontend served via `StaticFiles` (bundled into the sidecar with
  `--add-data frontend/dist`); `api.js` auto-targets same-origin when loaded from
  a LAN IP, the configured URL inside the desktop webview.
- **Settings → Mobile Access**: Active/Inactive toggle, the `http://<ip>:<port>`
  address, and a **locally-generated QR code** (qrcode lib, no external service).
- ✔ Tested: LAN blocked (403) while off; while on, phone can load the app (`/`)
  and the API (`/categories`); toggling off re-locks the LAN.
  Detected LAN IP `192.168.1.5`.

> ⚠️ First time the app binds the LAN port, **Windows Firewall** may prompt —
> click **Allow** (Private networks) so phones can connect.

### To test (dev, no rebuild)
```powershell
cd C:\chefos\frontend ; npm run build:desktop          # dist the backend serves
cd C:\chefos\backend
$env:CHEFOS_LOCAL = "1"
$env:CHEFOS_LICENSE_URL = "https://chefos-license.mohammedmagdy1912.workers.dev"
$env:CHEFOS_HOST = "0.0.0.0"
.\venv\Scripts\python.exe run_server.py
```
Open `http://localhost:8000` on the PC → Settings → Mobile Access → turn on →
scan the QR with your phone (same WiFi).

## ✅ STEP 4 — Data safety system   — BUILT & TESTED
All four layers in Settings:
- **Layer 1 — auto local backups** (`backups.py`): daily snapshot on startup to
  `AppData/ChefOS/backups/chefos_YYYY-MM-DD.db`, last 30 kept, skips if today's
  exists. ✔ tested.
- **Layer 2 — export**: "Export Backup → Desktop" → `ChefOS_Backup_YYYY-MM-DD.zip`
  (finds OneDrive Desktop too), shows the saved path. ✔ tested.
- **Layer 3 — restore**: list of daily snapshots each with Restore, plus
  "Restore from a .zip file" picker. Takes a `.pre-restore` safety copy first,
  disposes the engine, swaps the db, reloads the app. ✔ tested (9→8 categories).
- **Layer 4 — Google Drive** (`gdrive.py`, stdlib OAuth loopback + Drive REST):
  Connect/Disconnect, account email, last-upload time, **Backup Now**, automatic
  upload every 24h on startup (background thread), keep last 7, **Restore from
  Google Drive**. Token stored encrypted (fingerprint-bound). ✔ endpoints tested;
  the live OAuth needs your Google keys — see **`GOOGLE_DRIVE_SETUP.md`**.

> Drive needs build-time keys `CHEFOS_GOOGLE_CLIENT_ID` / `CHEFOS_GOOGLE_CLIENT_SECRET`
> (baked via Tauri). Until set, the Cloud Backup card shows "not set up in this build".

---

## How the local/cloud switch works (reference)
| Concern | Local desktop (`CHEFOS_LOCAL=1` / `VITE_LOCAL_MODE=true`) | Cloud (unset) |
|---|---|---|
| Database | SQLite at `CHEFOS_DB_PATH` | Postgres via `DATABASE_URL` |
| Auth | none — fixed user `"local"` | Supabase JWT |
| CORS | `*` (binds to localhost only) | explicit allow-list |
| Frontend login | skipped | Supabase login screen |
| Realtime / PWA | off | on |
