"""
Entry point for the bundled backend (the Tauri sidecar).

PyInstaller freezes THIS file into `chefos-backend.exe`. We import the FastAPI
app object directly (rather than passing an import string) so uvicorn works
reliably inside a frozen one-file executable.

Configuration comes from environment variables set by the Tauri shell:
    CHEFOS_LOCAL    = "1"        → local mode (no cloud login)
    CHEFOS_DB_PATH  = <path>     → SQLite file in AppData/Roaming/ChefOS
    CHEFOS_HOST     = 127.0.0.1  → bind address (0.0.0.0 enables LAN access)
    CHEFOS_PORT     = 8000
"""
import os
import uvicorn

from main import app

if __name__ == "__main__":
    host = os.environ.get("CHEFOS_HOST", "127.0.0.1")
    port = int(os.environ.get("CHEFOS_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="warning")
