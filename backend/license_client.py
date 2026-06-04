"""
ChefOS device-side license client.

Talks to the Cloudflare license Worker and caches an activation token locally
(encrypted + bound to this machine's fingerprint) in AppData/Roaming/ChefOS.

Policy:
  - Activation requires a valid key + this device's fingerprint.
  - Every 30 days, when online, the app silently re-validates with the server.
  - If offline, the app keeps working for a 60-day grace period since the last
    successful validation, then locks until it can re-verify.

No third-party dependencies (stdlib only) so the bundled sidecar stays small.
"""
import base64
import hashlib
import hmac
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

APP_SALT = "ChefOS-2026-license-v1"          # baked into the build
RECHECK_DAYS = 30
GRACE_DAYS = 60

LICENSE_URL = os.environ.get("CHEFOS_LICENSE_URL", "").rstrip("/")


def _data_dir() -> Path:
    db_path = os.environ.get("CHEFOS_DB_PATH")
    if db_path:
        d = Path(db_path).parent
    else:
        base = os.environ.get("APPDATA") or str(Path.home())
        d = Path(base) / "ChefOS"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _license_file() -> Path:
    return _data_dir() / "chefos.license"


# ── Hardware fingerprint ──────────────────────────────────
def get_fingerprint() -> str:
    parts = [hex(uuid.getnode())]                 # MAC-derived node id
    try:
        if sys.platform == "win32":
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                r"SOFTWARE\Microsoft\Cryptography") as k:
                guid, _ = winreg.QueryValueEx(k, "MachineGuid")
                parts.append(guid)                # stable per Windows install
    except Exception:
        pass
    parts.append(socket.gethostname())
    raw = "|".join(parts) + "|" + APP_SALT
    return hashlib.sha256(raw.encode()).hexdigest()[:40].upper()


# ── Local token sealing (XOR keystream + HMAC, bound to fingerprint) ──
def _derive(fp: str) -> bytes:
    return hashlib.sha256((fp + "|" + APP_SALT).encode()).digest()


def _keystream(key: bytes, n: int) -> bytes:
    out, ctr = b"", 0
    while len(out) < n:
        out += hashlib.sha256(key + ctr.to_bytes(8, "big")).digest()
        ctr += 1
    return out[:n]


def _seal(data: dict, fp: str) -> str:
    key = _derive(fp)
    plain = json.dumps(data).encode()
    ct = bytes(a ^ b for a, b in zip(plain, _keystream(key, len(plain))))
    mac = hmac.new(key, ct, hashlib.sha256).digest()
    return base64.b64encode(mac + ct).decode()


def _unseal(blob: str, fp: str):
    try:
        raw = base64.b64decode(blob)
        mac, ct = raw[:32], raw[32:]
        key = _derive(fp)
        if not hmac.compare_digest(mac, hmac.new(key, ct, hashlib.sha256).digest()):
            return None
        plain = bytes(a ^ b for a, b in zip(ct, _keystream(key, len(ct))))
        return json.loads(plain.decode())
    except Exception:
        return None


# ── HTTP helper ───────────────────────────────────────────
def _post(path: str, payload: dict, timeout: int = 10):
    req = urllib.request.Request(
        LICENSE_URL + path,
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            # Cloudflare blocks the default Python-urllib UA (error 1010),
            # so present a normal client UA.
            "User-Agent": "ChefOS/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


# ── Public API used by main.py ────────────────────────────
def activate(key: str) -> dict:
    if not LICENSE_URL:
        return {"ok": False, "error": "License server not configured in this build."}
    fp = get_fingerprint()
    try:
        data = _post("/activate", {
            "key": (key or "").strip().upper(),
            "fingerprint": fp,
            "device_name": socket.gethostname(),
        })
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read().decode())
        except Exception:
            data = {"error": f"HTTP {e.code}"}
        return {"ok": False, "error": data.get("error", "Activation failed")}
    except Exception:
        return {"ok": False, "error": "Cannot reach the license server. Check your internet connection."}

    if not data.get("ok"):
        return {"ok": False, "error": data.get("error", "Invalid license key")}

    rec = {
        "key": (key or "").strip().upper(),
        "token": data.get("token", ""),
        "chef_name": data.get("chef_name", ""),
        "fingerprint": fp,
        "activated_at": int(time.time()),
        "last_validated": int(time.time()),
        "expires_at": data.get("expires_at"),
    }
    _license_file().write_text(_seal(rec, fp))
    return {"ok": True, "chef_name": rec["chef_name"]}


def status() -> dict:
    fp = get_fingerprint()
    lf = _license_file()
    if not lf.exists():
        return {"activated": False, "fingerprint": fp, "reason": "no_license"}

    rec = _unseal(lf.read_text(), fp)
    if not rec or rec.get("fingerprint") != fp:
        return {"activated": False, "fingerprint": fp, "reason": "invalid_or_moved"}

    nowt = int(time.time())
    if rec.get("expires_at") and nowt > rec["expires_at"]:
        return {"activated": False, "fingerprint": fp, "reason": "expired"}

    age = nowt - rec.get("last_validated", 0)

    # Past the re-check interval → try a silent online re-validation.
    if age > RECHECK_DAYS * 86400 and LICENSE_URL:
        try:
            data = _post("/validate", {"key": rec["key"], "fingerprint": fp}, timeout=8)
            if data.get("ok"):
                rec["last_validated"] = nowt
                rec["token"] = data.get("token", rec["token"])
                rec["expires_at"] = data.get("expires_at")
                lf.write_text(_seal(rec, fp))
                age = 0
            else:
                # Server actively rejected (revoked / removed / expired) → lock.
                return {"activated": False, "fingerprint": fp,
                        "reason": data.get("error", "revoked")}
        except Exception:
            pass  # offline — fall through to grace check

    if age > GRACE_DAYS * 86400:
        return {"activated": False, "fingerprint": fp, "reason": "needs_reverification"}

    return {
        "activated": True,
        "chef_name": rec.get("chef_name", ""),
        "fingerprint": fp,
        "expires_at": rec.get("expires_at"),
        "last_validated": rec.get("last_validated"),
    }


def deactivate() -> dict:
    fp = get_fingerprint()
    lf = _license_file()
    rec = _unseal(lf.read_text(), fp) if lf.exists() else None
    if rec and LICENSE_URL:
        try:
            _post("/deactivate", {"key": rec["key"], "fingerprint": fp}, timeout=8)
        except Exception:
            pass
    try:
        lf.unlink()
    except Exception:
        pass
    return {"ok": True}
