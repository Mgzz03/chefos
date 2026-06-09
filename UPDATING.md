# ChefOS — How updates work & how to ship one

ChefOS now **auto-updates**. Once a chef is on **1.0.2+**, every future version you
publish installs itself on their machine (they just click "Install"). Their data
is never touched.

---

## One-time: the chef installs 1.0.2 manually
Auto-update only works *from* a build that has the updater (1.0.2). So the very
first time, send the chef **`ChefOS_1.0.2_x64-setup.exe`** and they install it
over the old one. After that, they never install a file by hand again.

---

## To ship an update (e.g. 1.0.3) — 4 steps

### 1. Bump the version
Edit **both**:
- `frontend/src-tauri/tauri.conf.json` → `"version": "1.0.3"`
- `frontend/src-tauri/Cargo.toml` → `version = "1.0.3"`
(and the "App version" label in `App.jsx` if you want it shown in Settings)

### 2. Build (signed)
In PowerShell, with the env set (same as a normal ship build) **plus the updater
signing key**:
> The real values for the env vars below live in **`run-local.ps1`** (gitignored,
> kept on your machine). Copy them from there — never commit the actual keys.
```powershell
$env:CHEFOS_LICENSE_URL          = "https://chefos-license.<your>.workers.dev"
$env:CHEFOS_GOOGLE_CLIENT_ID     = "<your-google-client-id>"
$env:CHEFOS_GOOGLE_CLIENT_SECRET = "<your-google-client-secret>"
$env:TAURI_SIGNING_PRIVATE_KEY          = Get-Content C:\chefos\updater-private.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<your-updater-key-password>"

cd C:\chefos\frontend ; npm run build:desktop          # build the UI first…
cd C:\chefos\backend  ; .\venv\Scripts\python.exe build_sidecar.py   # …so the sidecar bundles the SAME UI
cd C:\chefos\frontend ; npm run tauri build
```
This produces (under `frontend\src-tauri\target\release\bundle\nsis\`):
- `ChefOS_1.0.3_x64-setup.exe`
- `ChefOS_1.0.3_x64-setup.exe.sig`   ← the update signature

### 3. Make the `latest.json` manifest
Run the helper (it reads the `.sig` and writes the manifest):
```powershell
cd C:\chefos
.\backend\venv\Scripts\python.exe make_latest_json.py 1.0.3 "Bug fixes and improvements."
```
It writes `C:\chefos\latest.json` pointing at the v1.0.3 release asset.

### 4. Publish a GitHub Release
On https://github.com/Mgzz03/chefos/releases → **Draft a new release**:
- **Tag:** `v1.0.3`  (must match the version)
- **Attach 3 files:** `ChefOS_1.0.3_x64-setup.exe`, its `.sig`, and `latest.json`
- **Publish.**

That's it. Within a day (or on next launch) every chef's app sees the new
`latest.json`, offers the update, installs it, and relaunches.

> The app checks `https://github.com/Mgzz03/chefos/releases/latest/download/latest.json`
> on launch (configured in `tauri.conf.json`). Because it's the **/latest/**
> URL, you never have to change the app — just publish a newer release.

---

## Important: keep these safe
- **`updater-private.key`** + its password (see `run-local.ps1`) — this signs updates.
  If you lose it, existing installs can't be auto-updated (you'd have to send a
  new installer by hand). It is **gitignored** (never committed). Back it up.
- The matching **public key** is baked into the app (`tauri.conf.json`), so the
  app only accepts updates signed by your private key — nobody can push a fake one.

---

## What the chef sees
On launch (after ~8s) or via **Settings → Check for updates**, if a newer version
exists they get:
> "A new version of ChefOS (1.0.3) is available. Install it now?"
Click yes → it downloads, installs, and reopens. Done.
