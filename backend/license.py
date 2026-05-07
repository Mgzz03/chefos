"""
ChefOS License System
- Ties the app to a hardware fingerprint (MAC address + machine name)
- Each chef gets a unique license key
- Key is validated on every startup
- No internet required after activation
"""

import hashlib
import uuid
import socket
import json
import os
from pathlib import Path
from datetime import datetime

LICENSE_FILE = Path(__file__).parent / "chefos.license"
SECRET_SALT  = "CHEFOS-2026-SECRET-SALT-CHANGE-THIS"   # change per customer build

def get_machine_id() -> str:
    """Get a stable hardware fingerprint — MAC address + hostname."""
    mac  = ':'.join(['{:02x}'.format((uuid.getnode() >> i) & 0xff) for i in range(0, 8*6, 8)][::-1])
    host = socket.gethostname()
    raw  = f"{mac}|{host}|{SECRET_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32].upper()

def generate_license_key(machine_id: str, customer_name: str) -> str:
    """Generate a license key for a specific machine (run this on your end to give to chef)."""
    payload = f"{machine_id}|{customer_name}|{SECRET_SALT}"
    raw     = hashlib.sha256(payload.encode()).hexdigest().upper()
    # Format as XXXX-XXXX-XXXX-XXXX
    return '-'.join([raw[i:i+8] for i in range(0, 32, 8)])

def verify_license() -> dict:
    """Check if a valid license exists for this machine. Returns status dict."""
    machine_id = get_machine_id()

    if not LICENSE_FILE.exists():
        return {"valid": False, "reason": "no_license", "machine_id": machine_id}

    try:
        data = json.loads(LICENSE_FILE.read_text())
        stored_key    = data.get("key", "")
        customer_name = data.get("customer", "")
        expected_key  = generate_license_key(machine_id, customer_name)

        if stored_key != expected_key:
            return {"valid": False, "reason": "invalid_key", "machine_id": machine_id}

        return {
            "valid":    True,
            "customer": customer_name,
            "machine":  machine_id,
            "licensed_at": data.get("licensed_at", ""),
        }
    except Exception as e:
        return {"valid": False, "reason": str(e), "machine_id": machine_id}

def activate_license(key: str, customer_name: str) -> dict:
    """Activate a license on this machine."""
    machine_id   = get_machine_id()
    expected_key = generate_license_key(machine_id, customer_name)

    if key.strip().upper() != expected_key:
        return {"ok": False, "error": "Invalid license key for this machine."}

    data = {"key": key.strip().upper(), "customer": customer_name, "licensed_at": datetime.now().isoformat()}
    LICENSE_FILE.write_text(json.dumps(data, indent=2))
    return {"ok": True, "customer": customer_name}


# ── CLI helper (run: python license.py generate <customer_name>) ──────
if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3 and sys.argv[1] == "generate":
        # You (the seller) run this with the chef's machine_id
        # Usage: python license.py generate <machine_id> <customer_name>
        machine_id    = sys.argv[2]
        customer_name = sys.argv[3] if len(sys.argv) > 3 else "Chef"
        key           = generate_license_key(machine_id, customer_name)
        print(f"\n{'='*50}")
        print(f"Customer:    {customer_name}")
        print(f"Machine ID:  {machine_id}")
        print(f"License Key: {key}")
        print(f"{'='*50}\n")
    elif len(sys.argv) >= 2 and sys.argv[1] == "machine-id":
        mid = get_machine_id()
        print(f"\nThis machine's ID: {mid}\nSend this to the seller to get your license key.\n")
    else:
        status = verify_license()
        print(json.dumps(status, indent=2))
