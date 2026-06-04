"""
ChefOS Google Drive cloud backup (Step 4, layer 4).

OAuth2 "installed app" loopback flow + Drive REST, stdlib only. The refresh
token is stored encrypted (reusing the license module's fingerprint-bound seal)
in AppData/Roaming/ChefOS/gdrive.json.

Build-time config (baked by Tauri, like the license URL):
    CHEFOS_GOOGLE_CLIENT_ID
    CHEFOS_GOOGLE_CLIENT_SECRET
"""
import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer

import license_client as _lic
import backups as _bk

CLIENT_ID = os.environ.get("CHEFOS_GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("CHEFOS_GOOGLE_CLIENT_SECRET", "")
SCOPES = ("https://www.googleapis.com/auth/drive.file "
          "https://www.googleapis.com/auth/userinfo.email")
FOLDER_NAME = "ChefOS Backups"
KEEP = 7
REDIRECT_PORT = 53682
REDIRECT_URI = f"http://127.0.0.1:{REDIRECT_PORT}"


def _store_path():
    return os.path.join(_lic._data_dir(), "gdrive.json")


def _save(data):
    with open(_store_path(), "w") as f:
        f.write(_lic._seal(data, _lic.get_fingerprint()))


def _load():
    p = _store_path()
    if not os.path.exists(p):
        return None
    try:
        return _lic._unseal(open(p).read(), _lic.get_fingerprint())
    except Exception:
        return None


def _http(url, data=None, headers=None, method="GET", timeout=30):
    h = {"User-Agent": "ChefOS/1.0"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode() if method != "DELETE" else ""
        return json.loads(body or "{}")


def _token_request(params):
    return _http("https://oauth2.googleapis.com/token",
                 data=urllib.parse.urlencode(params).encode(),
                 headers={"Content-Type": "application/x-www-form-urlencoded"},
                 method="POST")


def _access_token():
    st = _load()
    if not st or not st.get("refresh_token"):
        return None
    try:
        tok = _token_request({
            "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
            "refresh_token": st["refresh_token"], "grant_type": "refresh_token",
        })
        return tok.get("access_token")
    except Exception:
        return None


# ── Connect (OAuth) — blocks up to ~3 min waiting for the browser ──
def connect():
    if not CLIENT_ID or not CLIENT_SECRET:
        return {"ok": False, "error": "Google Drive is not configured in this build."}

    holder = {}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            holder["code"] = (q.get("code") or [None])[0]
            holder["error"] = (q.get("error") or [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<html><body style='font-family:sans-serif;text-align:center;"
                b"padding-top:60px;background:#FAF7E7;color:#2E1A0E'>"
                b"<h2>ChefOS</h2><p>Google Drive connected. "
                b"You can close this tab and return to ChefOS.</p></body></html>")

        def log_message(self, *a):
            pass

    try:
        srv = HTTPServer(("127.0.0.1", REDIRECT_PORT), H)
    except OSError:
        return {"ok": False, "error": "Could not open the sign-in helper port. Close other ChefOS windows and retry."}

    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": CLIENT_ID, "redirect_uri": REDIRECT_URI, "response_type": "code",
        "scope": SCOPES, "access_type": "offline", "prompt": "consent",
    })
    webbrowser.open(auth_url)

    srv.timeout = 1
    waited = 0
    while "code" not in holder and "error" not in holder and waited < 180:
        srv.handle_request()
        waited += 1
    srv.server_close()

    if holder.get("error") or not holder.get("code"):
        return {"ok": False, "error": "Google sign-in was cancelled or timed out."}

    try:
        tok = _token_request({
            "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
            "code": holder["code"], "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        })
    except Exception as e:
        return {"ok": False, "error": f"Token exchange failed: {e}"}

    if not tok.get("refresh_token"):
        return {"ok": False, "error": "Google did not return a refresh token. "
                                      "Revoke ChefOS at myaccount.google.com/permissions and try again."}

    email = ""
    try:
        info = _http("https://www.googleapis.com/oauth2/v2/userinfo",
                     headers={"Authorization": "Bearer " + tok["access_token"]})
        email = info.get("email", "")
    except Exception:
        pass

    _save({"refresh_token": tok["refresh_token"], "email": email, "last_upload": 0})
    return {"ok": True, "email": email}


# ── Drive helpers ─────────────────────────────────────────
def _find_or_create_folder(at):
    q = urllib.parse.quote(
        f"name='{FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false")
    res = _http(f"https://www.googleapis.com/drive/v3/files?q={q}&fields=files(id,name)",
                headers={"Authorization": "Bearer " + at})
    files = res.get("files", [])
    if files:
        return files[0]["id"]
    created = _http("https://www.googleapis.com/drive/v3/files",
                    data=json.dumps({"name": FOLDER_NAME,
                                     "mimeType": "application/vnd.google-apps.folder"}).encode(),
                    headers={"Authorization": "Bearer " + at, "Content-Type": "application/json"},
                    method="POST")
    return created["id"]


def _list_files(at, folder):
    q = urllib.parse.quote(f"'{folder}' in parents and trashed=false")
    res = _http(f"https://www.googleapis.com/drive/v3/files?q={q}"
                f"&fields=files(id,name,createdTime,size)&orderBy=createdTime%20desc",
                headers={"Authorization": "Bearer " + at})
    return res.get("files", [])


def _prune(at, folder):
    for f in _list_files(at, folder)[KEEP:]:
        try:
            _http(f"https://www.googleapis.com/drive/v3/files/{f['id']}",
                  headers={"Authorization": "Bearer " + at}, method="DELETE")
        except Exception:
            pass


def backup_now():
    at = _access_token()
    if not at:
        return {"ok": False, "error": "Not connected to Google Drive."}
    db = _bk._db_path()
    if not db or not os.path.exists(db):
        return {"ok": False, "error": "No database to back up."}

    tmp = os.path.join(tempfile.gettempdir(), "chefos_gdrive.db")
    _bk._sqlite_backup(db, tmp)
    with open(tmp, "rb") as f:
        data = f.read()
    os.remove(tmp)

    folder = _find_or_create_folder(at)
    meta = {"name": f"chefos_{date.today().isoformat()}.db", "parents": [folder]}
    boundary = "chefosBoundary7MA4YWxkTrZu0gW"
    body = (("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
             + json.dumps(meta) + "\r\n--" + boundary
             + "\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
            + data + ("\r\n--" + boundary + "--\r\n").encode())
    try:
        _http("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
              data=body,
              headers={"Authorization": "Bearer " + at,
                       "Content-Type": "multipart/related; boundary=" + boundary},
              method="POST", timeout=120)
    except Exception as e:
        return {"ok": False, "error": f"Upload failed: {e}"}

    _prune(at, folder)
    st = _load() or {}
    st["last_upload"] = int(time.time())
    _save(st)
    return {"ok": True}


def list_drive():
    at = _access_token()
    if not at:
        return {"ok": False, "error": "Not connected to Google Drive."}
    folder = _find_or_create_folder(at)
    return {"ok": True, "files": _list_files(at, folder)}


def restore_drive(file_id):
    at = _access_token()
    if not at:
        return {"ok": False, "error": "Not connected to Google Drive."}
    req = urllib.request.Request(
        f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
        headers={"Authorization": "Bearer " + at, "User-Agent": "ChefOS/1.0"})
    tmp = os.path.join(tempfile.gettempdir(), "chefos_drive_restore.db")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            with open(tmp, "wb") as f:
                f.write(r.read())
    except Exception as e:
        return {"ok": False, "error": f"Download failed: {e}"}
    res = _bk._do_restore(tmp)
    try:
        os.remove(tmp)
    except Exception:
        pass
    return res


def status():
    st = _load()
    return {
        "connected": bool(st and st.get("refresh_token")),
        "email": (st or {}).get("email", ""),
        "last_upload": (st or {}).get("last_upload", 0),
        "configured": bool(CLIENT_ID and CLIENT_SECRET),
    }


def disconnect():
    try:
        if os.path.exists(_store_path()):
            os.remove(_store_path())
    except Exception:
        pass
    return {"ok": True}


def auto_backup_if_due():
    """Called on startup (in a thread): upload if >24h since the last one."""
    st = _load()
    if not st or not st.get("refresh_token"):
        return
    if int(time.time()) - st.get("last_upload", 0) >= 24 * 3600:
        try:
            backup_now()
        except Exception:
            pass
