import os
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# auto_error=False so a missing Authorization header does NOT 403 in local mode
security = HTTPBearer(auto_error=False)

LOCAL_USER_ID = "local"


def _is_local() -> bool:
    """Local desktop mode: license activation is the gate, not a login token."""
    return os.environ.get("CHEFOS_LOCAL") == "1" or not os.environ.get("SUPABASE_JWT_SECRET")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    # ── Local desktop build — single chef, no cloud login ──
    if _is_local():
        return LOCAL_USER_ID

    # ── Cloud build — verify a Supabase JWT (kept for completeness) ──
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing credentials")

    import jwt as pyjwt  # lazy import so the local sidecar doesn't bundle PyJWT

    token = credentials.credentials
    secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    try:
        payload = pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no subject")
        return user_id
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
