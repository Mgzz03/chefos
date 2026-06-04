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

**Needs YOUR machine to finish (native build — I can't run it here):**
- Install Rust + MS C++ Build Tools, then run the build (see `STEP1_BUILD_GUIDE.md`).
- Generate the app icons (`npm run tauri icon <logo.png>`) — chef-hat if you have one.
- Run `npm run tauri build` to produce the `.msi`/`.exe` installer.

**Skipped / notes:**
- Mac `.dmg` supported by the same config but can only be built *on a Mac*.

---

## ⏳ STEP 2 — License key activation (Cloudflare Worker + KV)   — NOT STARTED
Activation screen, hardware fingerprint, Cloudflare Worker + KV license server,
signed JWT, 30-day re-check / 60-day offline grace, admin page.
> Note: an old offline `backend/license.py` exists; Step 2 replaces it with the
> online Cloudflare system you specified.

## ⏳ STEP 3 — Same-WiFi mobile access   — NOT STARTED
Bind backend to LAN, auto-detect local IP, Settings toggle + QR code.

## ⏳ STEP 4 — Data safety system   — NOT STARTED
Auto local backups (30 days), manual export zip, restore, Google Drive OAuth backup.

---

## How the local/cloud switch works (reference)
| Concern | Local desktop (`CHEFOS_LOCAL=1` / `VITE_LOCAL_MODE=true`) | Cloud (unset) |
|---|---|---|
| Database | SQLite at `CHEFOS_DB_PATH` | Postgres via `DATABASE_URL` |
| Auth | none — fixed user `"local"` | Supabase JWT |
| CORS | `*` (binds to localhost only) | explicit allow-list |
| Frontend login | skipped | Supabase login screen |
| Realtime / PWA | off | on |
