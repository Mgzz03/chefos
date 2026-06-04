# Step 1 — Build & Test the ChefOS Desktop App

There are **two tiers**. Do Tier 1 first — it proves the app works locally and
needs **no extra tools**. Tier 2 produces the actual `.exe` installer and needs
the Rust toolchain.

---

## ✅ TIER 1 — Prove it works (no Rust, ~2 minutes)

This runs the exact same code the desktop app runs, just in your browser, so you
can confirm the local app works before installing the heavy build tools.

### 1. Start the backend in local mode
Open a terminal:
```powershell
cd C:\chefos\backend
$env:CHEFOS_LOCAL = "1"
.\venv\Scripts\python.exe run_server.py
```
You should see uvicorn start on `127.0.0.1:8000`. Leave it running.

> It creates/uses `C:\chefos\backend\chefos.db`. Your existing data is migrated
> automatically (a `user_id` column is added, set to `local`).

### 2. Start the frontend in desktop mode
Open a **second** terminal:
```powershell
cd C:\chefos\frontend
npm run dev:desktop
```

### 3. Open it
Go to **http://localhost:5173**.

**✅ PASS if:**
- No login screen appears — it goes straight into ChefOS.
- Recipes / inventory / events / everything loads.
- You can add a category/recipe and it persists after refresh.

Stop both terminals with `Ctrl+C` when done.

---

## 🛠️ TIER 2 — Build the real `.exe` installer

### One-time prerequisites (install these once)
1. **Microsoft C++ Build Tools** — download "Build Tools for Visual Studio",
   run the installer, check **“Desktop development with C++”**, install.
   <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
2. **Rust** — download & run `rustup-init.exe`, accept defaults, then **reopen
   your terminal**.
   <https://rustup.rs>
3. **WebView2** — already on Windows 10/11. (If not: Microsoft “Evergreen” installer.)
4. **PyInstaller** (into the backend venv):
   ```powershell
   cd C:\chefos\backend
   .\venv\Scripts\python.exe -m pip install pyinstaller
   ```

Verify Rust is ready:
```powershell
cargo --version    # should print a version
```

### Build steps

**1. Build the backend sidecar** (turns FastAPI into one `.exe`):
```powershell
cd C:\chefos\backend
.\venv\Scripts\python.exe build_sidecar.py
```
This creates `frontend\src-tauri\binaries\chefos-backend-x86_64-pc-windows-msvc.exe`.

**2. Install the frontend + Tauri dependencies:**
```powershell
cd C:\chefos\frontend
npm install
```

**3. Generate the app icons** (required — the build fails without them).
Use any square PNG (≥ 512px; a chef-hat logo is ideal):
```powershell
npm run tauri icon C:\path\to\your-logo.png
```
This fills `src-tauri\icons\` with every size Windows/Mac need.

**4. Quick dev run** (opens the real native window, hot-reload):
```powershell
npm run tauri dev
```
✅ PASS if the ChefOS window opens, the app works, and closing the window also
stops the backend (no leftover `chefos-backend.exe` in Task Manager).

**5. Build the installer:**
```powershell
npm run tauri build
```
When it finishes, your installer is here:
```
C:\chefos\frontend\src-tauri\target\release\bundle\
    msi\ChefOS_1.0.0_x64_en-US.msi      ← single-file installer to send the chef
    nsis\ChefOS_1.0.0_x64-setup.exe     ← alternative installer
```

**6. Final check:** double-click the `.msi`, install, launch ChefOS from the
Start Menu. The window opens, the backend starts silently, data is saved in
`C:\Users\<name>\AppData\Roaming\ChefOS\chefos.db`.

---

## Troubleshooting
- **`cargo: command not found`** → reopen the terminal after installing Rust.
- **`chefos-backend sidecar is missing`** → you skipped Tier 2 step 1 (`build_sidecar.py`).
- **`link.exe` / MSVC errors** → the C++ Build Tools aren’t installed (prereq 1).
- **Blank window** → make sure the sidecar built and that nothing else is using
  port 8000.
- **Mac `.dmg`** → run the same steps on a Mac (`build_sidecar.py` auto-detects
  the platform; `npm run tauri build` produces a `.dmg`).

When Tier 1 passes, tell me and we’ll move to **Step 2 (license activation)**.
