# ChefOS License Server (Cloudflare Worker)

A free license-key server: a Cloudflare Worker backed by a KV store. It issues
and validates `CHEF-XXXX-XXXX-XXXX` keys, tracks which devices each key is
activated on, and lets you revoke/extend access remotely.

**Cost: $0** — Cloudflare's free tier covers this easily (100k requests/day).

---

## One-time setup (≈10 minutes)

### 1. Create a free Cloudflare account
<https://dash.cloudflare.com/sign-up> — no credit card needed.

### 2. Install Wrangler (Cloudflare's CLI) and log in
In a terminal:
```powershell
npm install -g wrangler
wrangler login
```
A browser opens → click **Allow**.

### 3. Create the KV namespace
```powershell
cd C:\chefos\license-server
wrangler kv namespace create LICENSES
```
It prints something like:
```
[[kv_namespaces]]
binding = "LICENSES"
id = "abc123def456...."
```
Copy that **id** and paste it into `wrangler.toml`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`.

### 4. Set the two secrets
Pick your own long random strings (e.g. mash the keyboard, 30+ chars each).
```powershell
wrangler secret put JWT_SECRET
# paste a long random string, press Enter

wrangler secret put ADMIN_TOKEN
# paste a DIFFERENT long random string, press Enter
```
- `JWT_SECRET` signs activation tokens — never share it.
- `ADMIN_TOKEN` is the password for your admin page — never share it.

### 5. Deploy
```powershell
wrangler deploy
```
It prints your Worker URL, e.g.:
```
https://chefos-license.YOURNAME.workers.dev
```
**Copy that URL** — you need it in two places:
- the **admin page** (to manage keys)
- the **ChefOS app** build (so the app knows where to activate)

---

## Using the admin page
1. Open `admin.html` (this folder) in your browser — just double-click it.
2. Enter your **Worker URL** and **ADMIN_TOKEN** → **Connect & refresh**.
3. **Generate a key** for a chef → copy the `CHEF-XXXX-XXXX-XXXX` → send it to them.
4. The table shows every key: which devices it's active on, status, expiry.
   - **Revoke** — instantly locks the app on next online re-check.
   - **Enable** — re-activate a revoked key.
   - **Reset devices** — clears registered devices (chef can move laptops).
   - **Set expiry** — time-limit or extend a license.
   - **Delete** — remove a key entirely.

---

## Test it from the command line (optional)
```powershell
# generate a key (replace URL + token)
curl -X POST https://chefos-license.YOURNAME.workers.dev/admin/keys ^
  -H "x-admin-token: YOUR_ADMIN_TOKEN" -H "content-type: application/json" ^
  -d "{\"chef_name\":\"Test\",\"max_devices\":1}"

# activate it on a fake device
curl -X POST https://chefos-license.YOURNAME.workers.dev/activate ^
  -H "content-type: application/json" ^
  -d "{\"key\":\"CHEF-XXXX-XXXX-XXXX\",\"fingerprint\":\"test-device-123\"}"
```

---

## How the app uses this
The ChefOS desktop backend (`backend/license_client.py`) calls:
- `POST /activate` when the chef enters their key on the activation screen.
- `POST /validate` silently every 30 days (60-day offline grace before it locks).
- `POST /deactivate` from Settings → "Deactivate this device".

You set the Worker URL into the app via the `CHEFOS_LICENSE_URL` env var at build
time (wired into the Tauri sidecar) — covered when we finish Steps 2's app side.
