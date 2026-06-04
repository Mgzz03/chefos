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

## 3. Configure the consent screen
1. **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → **Create**.
3. App name: `ChefOS`. User support email: your email. Developer email: your email. **Save and continue**.
4. **Scopes** → Save and continue (no changes needed).
5. **Test users** → **Add users** → add the Google account(s) that will use the
   backup (the chef's Google account, and yours). **Save and continue.**
   > Leave the app in **Testing** mode — no Google verification needed for personal use.

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
- Only the **test users** you added in step 3 can connect — that's the security boundary.
- ChefOS uses the `drive.file` scope: it can **only** touch the backups it creates,
  never the rest of your Drive.
- The Client ID/secret for a Desktop app are not true secrets (they're embedded in
  every desktop app); your data is protected by the per-user Google sign-in, not
  by hiding these values.
