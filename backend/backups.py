"""
ChefOS local backup system (Step 4, layers 1-3).

  Layer 1  auto_backup()        — daily snapshot on startup, keep last 30
  Layer 2  export_to_desktop()  — ChefOS_Backup_YYYY-MM-DD.zip on the Desktop
  Layer 3  list_backups() / restore_*()  — restore from a local snapshot or a .zip

Uses SQLite's online backup API so snapshots are consistent even while the app
is running. Stdlib only.
"""
import base64
import io
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import date

KEEP = 30


def _db_path():
    p = os.environ.get("CHEFOS_DB_PATH")
    if p:
        return p
    try:
        from database import DATABASE_URL
        if DATABASE_URL.startswith("sqlite:///"):
            return DATABASE_URL[len("sqlite:///"):]
    except Exception:
        pass
    return None


def _backups_dir():
    db = _db_path()
    if not db:
        return None
    d = os.path.join(os.path.dirname(db), "backups")
    os.makedirs(d, exist_ok=True)
    return d


def _desktop_dir():
    up = os.environ.get("USERPROFILE") or os.path.expanduser("~")
    for cand in (os.path.join(up, "Desktop"), os.path.join(up, "OneDrive", "Desktop")):
        if os.path.isdir(cand):
            return cand
    return up


def _sqlite_backup(src_path, dst_path):
    """Consistent copy of a (possibly in-use) SQLite db."""
    src = sqlite3.connect(src_path)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


# ── Layer 1: automatic daily backup ───────────────────────
def auto_backup():
    db = _db_path()
    if not db or not os.path.exists(db):
        return
    bdir = _backups_dir()
    dest = os.path.join(bdir, f"chefos_{date.today().isoformat()}.db")
    if not os.path.exists(dest):
        try:
            _sqlite_backup(db, dest)
        except Exception:
            try:
                shutil.copy2(db, dest)
            except Exception:
                return
    _prune(bdir)


def _prune(bdir):
    files = sorted(f for f in os.listdir(bdir) if f.startswith("chefos_") and f.endswith(".db"))
    for f in files[:-KEEP] if len(files) > KEEP else []:
        try:
            os.remove(os.path.join(bdir, f))
        except Exception:
            pass


# ── Layer 3: list ─────────────────────────────────────────
def list_backups():
    bdir = _backups_dir()
    out = []
    if bdir and os.path.isdir(bdir):
        for f in sorted(os.listdir(bdir), reverse=True):
            if f.startswith("chefos_") and f.endswith(".db"):
                st = os.stat(os.path.join(bdir, f))
                out.append({"name": f, "date": f[len("chefos_"):-3],
                            "size": st.st_size, "modified": int(st.st_mtime)})
    return out


# ── Layer 2: export a zip to the Desktop ──────────────────
def export_to_desktop():
    db = _db_path()
    if not db or not os.path.exists(db):
        return {"ok": False, "error": "No database found to export."}
    name = f"ChefOS_Backup_{date.today().isoformat()}.zip"
    path = os.path.join(_desktop_dir(), name)
    tmp = os.path.join(tempfile.gettempdir(), "chefos_export.db")
    try:
        _sqlite_backup(db, tmp)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(tmp, "chefos.db")
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return {"ok": True, "path": path}


# ── Layer 3: restore ──────────────────────────────────────
def _do_restore(src_db_path):
    db = _db_path()
    if not db:
        return {"ok": False, "error": "No database path."}
    # Safety snapshot of the current data before we overwrite it.
    try:
        _sqlite_backup(db, db + ".pre-restore")
    except Exception:
        pass
    try:
        from database import engine
        engine.dispose()
    except Exception:
        pass
    shutil.copy2(src_db_path, db)
    return {"ok": True}


def restore_from_backup(name):
    bdir = _backups_dir()
    src = os.path.join(bdir, os.path.basename(name or ""))
    if not os.path.exists(src):
        return {"ok": False, "error": "Backup not found."}
    return _do_restore(src)


def restore_from_zip_b64(zip_b64):
    """Restore from a user-supplied .zip (base64) containing chefos.db."""
    try:
        raw = base64.b64decode(zip_b64)
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        return {"ok": False, "error": "That file is not a valid ChefOS backup zip."}
    member = next((n for n in zf.namelist() if n.endswith("chefos.db")), None)
    if not member:
        return {"ok": False, "error": "The zip does not contain chefos.db."}
    tmp = os.path.join(tempfile.gettempdir(), "chefos_restore.db")
    with open(tmp, "wb") as f:
        f.write(zf.read(member))
    try:
        # sanity check it's a real sqlite db
        c = sqlite3.connect(tmp); c.execute("PRAGMA schema_version;"); c.close()
    except Exception:
        os.remove(tmp)
        return {"ok": False, "error": "The backup file is corrupt."}
    res = _do_restore(tmp)
    try:
        os.remove(tmp)
    except Exception:
        pass
    return res
