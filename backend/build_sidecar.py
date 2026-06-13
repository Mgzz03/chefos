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

# Fallback mapping if rustc isn't on PATH: (system, machine) -> (triple, ext)
TRIPLES = {
    ("Windows", "AMD64"):  ("x86_64-pc-windows-msvc",   ".exe"),
    ("Windows", "ARM64"):  ("aarch64-pc-windows-msvc",  ".exe"),
    ("Darwin",  "arm64"):  ("aarch64-apple-darwin",     ""),
    ("Darwin",  "x86_64"): ("x86_64-apple-darwin",      ""),
    ("Linux",   "x86_64"): ("x86_64-unknown-linux-gnu", ""),
}


def active_target() -> tuple[str, str]:
    """Use the active rustc host triple so the sidecar name matches the Tauri
    build target exactly (msvc vs gnu matters). Fall back to a static map."""
    ext = ".exe" if platform.system() == "Windows" else ""
    try:
        out = subprocess.run(["rustc", "-vV"], capture_output=True, text=True, check=True).stdout
        for line in out.splitlines():
            if line.startswith("host:"):
                return line.split(":", 1)[1].strip(), ext
    except Exception:
        pass
    key = (platform.system(), platform.machine())
    if key not in TRIPLES:
        sys.exit(f"Unsupported platform {key} and rustc not found. Edit build_sidecar.py.")
    return TRIPLES[key]


def main() -> None:
    triple, ext = active_target()

    # Bundle the built frontend so the backend can serve it over the LAN
    # (Mobile Access). Build it first:  cd frontend && npm run build:desktop
    dist = ROOT.parent / "frontend" / "dist"
    add_data = []
    if dist.is_dir():
        sep = ";" if platform.system() == "Windows" else ":"
        add_data = ["--add-data", f"{dist}{sep}frontend_dist"]
        print(f"==> Bundling frontend from {dist}")
    else:
        print("!! WARNING: frontend/dist not found — Mobile Access won't serve the app.")
        print("   Run `npm run build:desktop` in frontend/ first, then re-run this.")

    print(f"==> Building sidecar (one-folder) for {triple} ...")
    # --onedir (NOT --onefile): a one-file exe unpacks its whole Python runtime to
    # a temp dir on EVERY launch, which antivirus on a locked-down customer machine
    # scans/blocks — the backend then hangs before it ever starts (no backend.log).
    # One-folder ships the runtime unpacked next to the exe, so it starts instantly
    # and triggers far less AV. The whole folder is bundled as a Tauri resource and
    # spawned directly from there (see src-tauri/src/lib.rs).
    subprocess.run(
        [
            sys.executable, "-m", "PyInstaller",
            "--onedir",
            "--name", "chefos-backend",
            "--noconfirm",
            "--clean",
            "--console",
            *add_data,
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

    src_dir = ROOT / "dist" / "chefos-backend"          # folder with the exe + _internal/
    if not (src_dir / f"chefos-backend{ext}").exists():
        sys.exit(f"Expected build output not found: {src_dir}")

    # Bundle the whole folder as a Tauri resource (preserved verbatim in the app).
    dst_dir = ROOT.parent / "frontend" / "src-tauri" / "backend-dist" / "chefos-backend"
    if dst_dir.exists():
        shutil.rmtree(dst_dir)
    dst_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_dir, dst_dir)
    print(f"==> Sidecar (folder) ready: {dst_dir}")


if __name__ == "__main__":
    main()
