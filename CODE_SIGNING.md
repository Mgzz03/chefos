# ChefOS — Code Signing Guide (reduce antivirus / SmartScreen warnings)

## Why this matters
ChefOS is currently **unsigned**. On a customer PC that causes:
- **"Windows protected your PC"** (SmartScreen) blue box on install.
- Antivirus (Defender, McAfee, etc.) sometimes **quarantining** the bundled
  backend `.exe` — which can show up as **"couldn't reach the app service"**.

Signing the app with a real certificate makes Windows trust it: the warnings go
away and AV is far less likely to flag it.

---

## Your options (cheapest → most trusted)

### Option A — Azure Trusted Signing  ⭐ recommended (cheapest, modern)
Microsoft's own signing service. ~**$10/month**, no hardware token.
- Requires a verified business or individual identity (Microsoft verifies you).
- Integrates with the Tauri build via the `signCommand` hook.
- Best value and the path Tauri officially recommends now.
- Docs: https://learn.microsoft.com/azure/trusted-signing/

### Option B — OV Code Signing Certificate (Sectigo / DigiCert / etc.)
~**$200–400/year**. A standard certificate file you sign with.
- Removes AV/Defender flags immediately.
- SmartScreen reputation builds up over a few installs/weeks.

### Option C — EV Code Signing Certificate
~**$300–600/year**, ships on a hardware USB token.
- **Instant SmartScreen trust** (no reputation wait) — the gold standard.
- The token makes automated/CI signing harder.

> For a single chef, **Option A** (Azure Trusted Signing) is the sweet spot.
> If you'll sell to many restaurants, **Option C (EV)** gives the cleanest install.

---

## How to wire it into the Tauri build (once you have a cert)

Tauri signs the `.exe`/installer automatically when you set a `signCommand` (or
the classic `certificateThumbprint`) in `tauri.conf.json` → `bundle.windows`.

### With an OV/EV cert installed in the Windows certificate store
```jsonc
// frontend/src-tauri/tauri.conf.json  →  "bundle": { ... }
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```
Find the thumbprint: `Get-ChildItem Cert:\CurrentUser\My | Format-List Subject, Thumbprint`

### With Azure Trusted Signing (Option A)
Use a `signCommand` that calls Microsoft's `Invoke-TrustedSigning` / `signtool`:
```jsonc
"windows": {
  "signCommand": "trusted-signing-cli -e https://<region>.codesigning.azure.net -a <account> -c <cert-profile> %1"
}
```
(Install `trusted-signing-cli` and authenticate once with your Azure account.)

Then build exactly as today:
```powershell
cd C:\chefos\frontend ; npm run tauri build
```
The produced installer is now **signed** — no SmartScreen block, no AV quarantine.

---

## Until you sign it — what to tell the chef
The new build already shows clear guidance, but you can pre-empt it:
1. On the install warning, click **More info → Run anyway**.
2. If their antivirus quarantines ChefOS, **allow / restore** it (it's safe — it's
   your app), then reopen.
3. The app now survives a busy port and logs problems to
   `%AppData%\Roaming\ChefOS\backend.log` if anything still goes wrong.

---

## Note on the *update* signing key (different thing!)
You already generated an **update signing key** (`updater-private.key`) — that's
for the **auto-update** feature (it proves an update came from you). It is **not**
a Windows code-signing certificate and does **not** remove SmartScreen/AV
warnings. You need a real certificate (above) for that. Keep both:
- `updater-private.key` + password → signs auto-update packages.
- Code-signing cert → signs the installer so Windows trusts it.
