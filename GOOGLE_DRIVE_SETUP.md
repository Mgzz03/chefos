# ChefOS — Google Drive Cloud Backup setup

This lets ChefOS upload a daily copy of the database to **your own Google Drive**
(folder "ChefOS Backups", last 7 kept). **Cost: $0.** ~10 minutes, one time.

You'll create a Google "OAuth client" and paste two values into the app build.

---

## 1. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/> (sign in with your Google account).
2. Top bar → project dropdown → **New Project** → name it `ChefOS` → **Create**.
3. Make sure the new project is selected (top bar).

## 2. Enable the Google Drive API
1. Left menu → **APIs & Services** → **Library**.
2. Search **Google Drive API** → click it → **Enable**.

## 3. Configure the consent screen — and PUBLISH it
1. **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → **Create**.
3. App name: `ChefOS`. User support email: your email. Developer contact: your email. **Save and continue**.
4. **Scopes** → Save and continue (no changes needed).
5. **Test users** → Save and continue (you can skip adding any).
6. **Publish the app:** go back to the **OAuth consent screen** (or the **Audience**
   tab in newer UI). Under *Publishing status: Testing*, click **PUBLISH APP** → **Confirm**.
   > This moves it to **In production** so the chef's Google Drive connection
   > **never expires**. The chef will see a one-time *"Google hasn't verified this
   > app"* notice and click past it — that's normal and safe for the `drive.file`
   > scope (the app can only touch its own backup files). You can submit for
   > Google verification later to remove that notice; it's not required.

## 4. Create the OAuth client (Desktop app)
1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Desktop app** → name `ChefOS Desktop` → **Create**.
3. A dialog shows your **Client ID** and **Client secret** — copy both.
   (Desktop apps allow the `http://127.0.0.1` sign-in redirect automatically, so
   there's nothing else to configure.)

## 5. Build ChefOS with the keys baked in
In PowerShell, set all three build values, then rebuild:
```powershell
$env:CHEFOS_LICENSE_URL          = "https://chefos-license.mohammedmagdy1912.workers.dev"
$env:CHEFOS_GOOGLE_CLIENT_ID     = "PASTE_YOUR_CLIENT_ID"
$env:CHEFOS_GOOGLE_CLIENT_SECRET = "PASTE_YOUR_CLIENT_SECRET"

cd C:\chefos\frontend ; npm run build:desktop
cd C:\chefos\backend  ; .\venv\Scripts\python.exe build_sidecar.py
cd C:\chefos\frontend ; npm run tauri build
```

> **Dev test without rebuilding:** set the same three `$env:` values, then run
> `.\venv\Scripts\python.exe run_server.py` and use the app from a browser.

## 6. Use it
In ChefOS → **Settings → Cloud Backup** → **Connect Google Drive**:
- Your browser opens Google sign-in. Because the app is in Testing mode you'll see
  **"Google hasn't verified this app"** → click **Advanced** → **Go to ChefOS (unsafe)**
  → **Allow**. (This is normal for a personal app; only *you* can authorize it.)
- After that: **Backup Now**, automatic daily upload, and **Restore from Google
  Drive** all work. ChefOS can only see files it created (the `drive.file` scope).

---

### Notes
- Because the app is **Published (production)**, any chef can connect with their own
  Google account, and the connection **persists** (no weekly reconnect). They just
  click past the one-time "unverified app" notice.
- ChefOS uses the `drive.file` scope: it can **only** touch the backups it creates,
  never the rest of the chef's Drive.
- The Client ID/secret for a Desktop app are not true secrets (they're embedded in
  every desktop app); your data is protected by the per-user Google sign-in, not
  by hiding these values.
