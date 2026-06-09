"""
Generate latest.json for ChefOS auto-update (Tauri updater).

Usage:
    python make_latest_json.py <version> ["release notes"]
    e.g.  python make_latest_json.py 1.0.3 "Bug fixes and the new prep view."

Reads the signed update's .sig file from the last build and writes latest.json
in the repo root. Upload that latest.json (plus the setup .exe and its .sig) to
the GitHub release tagged v<version>.
"""
import sys
import json
import datetime
import pathlib

GITHUB_REPO = "Mgzz03/chefos"

def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python make_latest_json.py <version> [\"notes\"]")
    version = sys.argv[1].lstrip("v")
    notes = sys.argv[2] if len(sys.argv) > 2 else "Bug fixes and improvements."

    root = pathlib.Path(__file__).parent
    nsis = root / "frontend" / "src-tauri" / "target" / "release" / "bundle" / "nsis"
    sig_path = nsis / f"ChefOS_{version}_x64-setup.exe.sig"
    exe_path = nsis / f"ChefOS_{version}_x64-setup.exe"

    if not sig_path.exists():
        sys.exit(f"Signature not found: {sig_path}\nDid you build {version} with TAURI_SIGNING_PRIVATE_KEY set?")
    if not exe_path.exists():
        sys.exit(f"Installer not found: {exe_path}")

    signature = sig_path.read_text(encoding="utf-8").strip()
    url = f"https://github.com/{GITHUB_REPO}/releases/download/v{version}/ChefOS_{version}_x64-setup.exe"

    manifest = {
        "version": version,
        "notes": notes,
        "pub_date": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "windows-x86_64": {"signature": signature, "url": url},
        },
    }
    out = root / "latest.json"
    out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {out}")
    print(f"  version : {version}")
    print(f"  url     : {url}")
    print("Now publish a GitHub release tagged "
          f"v{version} and attach: the setup .exe, its .sig, and this latest.json")


if __name__ == "__main__":
    main()
