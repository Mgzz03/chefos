"""
Build the backend into a single executable and drop it where Tauri expects it.

Run from the backend folder (with the venv active):
    py build_sidecar.py

It will:
  1. PyInstaller-freeze run_server.py  ->  dist/chefos-backend[.exe]
  2. Copy it to  frontend/src-tauri/binaries/chefos-backend-<target-triple>[.exe]
     (Tauri requires the platform target-triple suffix on sidecar binaries.)

Requires PyInstaller:  py -m pip install pyinstaller
"""
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent

# (system, machine) -> (rust target triple, exe extension)
TRIPLES = {
    ("Windows", "AMD64"):  ("x86_64-pc-windows-msvc",   ".exe"),
    ("Windows", "ARM64"):  ("aarch64-pc-windows-msvc",  ".exe"),
    ("Darwin",  "arm64"):  ("aarch64-apple-darwin",     ""),
    ("Darwin",  "x86_64"): ("x86_64-apple-darwin",      ""),
    ("Linux",   "x86_64"): ("x86_64-unknown-linux-gnu", ""),
}


def main() -> None:
    key = (platform.system(), platform.machine())
    if key not in TRIPLES:
        sys.exit(f"Unsupported platform {key}. Add it to TRIPLES in build_sidecar.py.")
    triple, ext = TRIPLES[key]

    print(f"==> Building sidecar for {triple} ...")
    subprocess.run(
        [
            sys.executable, "-m", "PyInstaller",
            "--onefile",
            "--name", "chefos-backend",
            "--noconfirm",
            "--clean",
            # FastAPI/uvicorn/sqlalchemy/pydantic pull in modules dynamically;
            # collect them whole so nothing is missing at runtime.
            "--collect-all", "uvicorn",
            "--collect-all", "fastapi",
            "--collect-all", "sqlalchemy",
            "--collect-all", "pydantic",
            "--collect-all", "pydantic_core",
            "run_server.py",
        ],
        cwd=ROOT,
        check=True,
    )

    src = ROOT / "dist" / f"chefos-backend{ext}"
    if not src.exists():
        sys.exit(f"Expected build output not found: {src}")

    dst_dir = ROOT.parent / "frontend" / "src-tauri" / "binaries"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / f"chefos-backend-{triple}{ext}"
    shutil.copy2(src, dst)
    print(f"==> Sidecar ready: {dst}")


if __name__ == "__main__":
    main()
