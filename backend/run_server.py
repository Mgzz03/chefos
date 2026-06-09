"""
Entry point for the bundled backend (the Tauri sidecar).

PyInstaller freezes THIS file into `chefos-backend.exe`. We import the FastAPI
app object directly (rather than passing an import string) so uvicorn works
reliably inside a frozen one-file executable.

Configuration comes from environment variables set by the Tauri shell:
    CHEFOS_LOCAL    = "1"        → local mode (no cloud login)
    CHEFOS_DB_PATH  = <path>     → SQLite file in AppData/Roaming/ChefOS
    CHEFOS_HOST     = 127.0.0.1  → bind address (0.0.0.0 enables LAN access)
    CHEFOS_PORT     = 8000       → preferred port (auto-falls-back if busy)

On startup this writes a small log to  <data dir>/backend.log  and the chosen
port to  <data dir>/port  so problems on a customer machine are diagnosable and
the UI can find the backend even if 8000 was taken.
"""
import os
import sys
import socket
import traceback
from datetime import datetime
from pathlib import Path


def _data_dir() -> Path:
    """Where the DB lives — we put logs and the port file right next to it."""
    db = os.environ.get("CHEFOS_DB_PATH", "")
    if db:
        return Path(db).parent
    base = os.environ.get("APPDATA") or os.environ.get("HOME") or str(Path.home())
    return Path(base) / "ChefOS"


def _log(msg: str) -> None:
    try:
        d = _data_dir()
        d.mkdir(parents=True, exist_ok=True)
        logf = d / "backend.log"
        # keep the log small
        if logf.exists() and logf.stat().st_size > 200_000:
            logf.write_text("", encoding="utf-8")
        with open(logf, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")
    except Exception:
        pass


def _port_is_free(host: str, port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        s.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def _pick_port(host: str, preferred: int) -> int:
    """Use the preferred port if we can, otherwise scan a small range.
    We require the port to be free both on the bind host AND on 127.0.0.1,
    because the desktop UI always talks to 127.0.0.1."""
    candidates = [preferred] + [p for p in range(preferred + 1, preferred + 11)]
    for p in candidates:
        if _port_is_free(host, p) and _port_is_free("127.0.0.1", p):
            return p
    return preferred  # give up gracefully; uvicorn will report the real error


def main() -> None:
    host = os.environ.get("CHEFOS_HOST", "127.0.0.1")
    preferred = int(os.environ.get("CHEFOS_PORT", "8000"))
    port = _pick_port(host, preferred)

    # Publish the chosen port so the UI can find us and Mobile Access reports it.
    os.environ["CHEFOS_PORT"] = str(port)
    try:
        d = _data_dir()
        d.mkdir(parents=True, exist_ok=True)
        (d / "port").write_text(str(port), encoding="utf-8")
    except Exception:
        pass

    _log(f"starting backend  host={host} port={port} (preferred {preferred})  python={sys.version.split()[0]}")

    # Importing main runs migrations + sets up the DB; capture any failure.
    from main import app
    import uvicorn

    _log("backend imports OK — launching uvicorn")
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        _log("STARTUP FAILED:\n" + traceback.format_exc())
        # also echo to stderr so Tauri's log pipe captures it
        traceback.print_exc()
        raise
