"""FastAPI dependency that turns an `Authorization: Bearer <jwt>`
header into a verified TenantContext.

Counterpart of packages/core/src/tenancy/jwt.ts on the web side. The
two pieces share `ENGINE_JWT_SECRET` (HS256) and a small claim shape:

    tid       UUID string. Becomes ctx.tenant_id.
    pid       UUID string or None. Becomes ctx.practitioner_id.
    role      role at sign time. Becomes ctx.role.
    jid       request-scoped correlation id. Becomes ctx.job_id.
    lifecycle tenant lifecycle_status snapshot at sign time. Becomes
              ctx.lifecycle_status.
    iat / exp standard JWT timestamps in seconds.

Why a snapshot of `lifecycle` rather than re-querying the DB on each
request: the engine is on a hot path and an extra round-trip to verify
status would be observable. A 5-minute TTL is short enough that
"recently active, just suspended" is a short-lived race we accept
(the next protocol generation request will fail at the gate). The web
tier's session.ts is the authoritative source.

What this dependency rejects:
    - missing or malformed Authorization header               -> 401
    - JWT past exp / before iat (with 30s skew tolerance)     -> 401
    - HMAC mismatch                                           -> 401
    - alg != HS256                                            -> 401
    - missing required claim                                  -> 401

What it does NOT do:
    - resource-ownership cross-check. The plan called for a 403
      fast-fail when a body resource id (patient_id, record_id, etc.)
      exists but belongs to a different tenant — distinguishing
      "wrong tenant" from "truly not found" for audit clarity. That
      check needs to read the row WITHOUT RLS to compare its
      tenant_id against the JWT's claim. Our app_user role does not
      have BYPASSRLS, so a no-GUC connection still hides the row.
      Implementing the 403 cleanly requires either:
        a) a separate SQL role with BYPASSRLS used only for these
           checks, or
        b) SECURITY DEFINER helper functions owned by a privileged
           role.
      Both are out of scope for PR5. Until then we rely on RLS's
      natural 404 — the security guarantee is identical, only the
      audit signal "wrong tenant probed" is slightly weaker.
"""
from __future__ import annotations

import os
from typing import Annotated, Final

import jwt
from fastapi import Header, HTTPException

from .tenancy import TenantContext

# Soft skew accepted on iat/exp. Mirrors the TS side default. 30s
# covers normal NTP drift between web and engine hosts without
# meaningfully widening the replay window.
_CLOCK_SKEW_SECONDS: Final[int] = 30


class EngineAuthMisconfigured(RuntimeError):
    """Raised if ENGINE_JWT_SECRET is missing at request time. This is
    a deployment error, not a client error — surfaces as a 500 via
    FastAPI's default handling so ops sees it loudly."""


def _read_secret() -> str:
    secret = os.environ.get("ENGINE_JWT_SECRET", "").strip()
    if not secret:
        raise EngineAuthMisconfigured(
            "ENGINE_JWT_SECRET is not set on the engine. The web tier "
            "must sign requests with the same secret. See "
            "infrastructure/aws/secrets-and-iam.md for rotation."
        )
    return secret


def require_engine_jwt(
    authorization: Annotated[str | None, Header()] = None,
) -> TenantContext:
    """FastAPI dependency: parse and verify the Authorization header.

    On success, returns a TenantContext built from the verified JWT
    claims. The route handler receives that context; the request body
    no longer carries (and should never carry) a `tenant_id` field.
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="missing Authorization header",
        )
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=401,
            detail="Authorization header must be 'Bearer <jwt>'",
        )
    token = parts[1].strip()

    secret = _read_secret()
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat"]},
            leeway=_CLOCK_SKEW_SECONDS,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="JWT expired")
    except jwt.ImmatureSignatureError:
        raise HTTPException(status_code=401, detail="JWT iat in the future")
    except jwt.InvalidSignatureError:
        raise HTTPException(status_code=401, detail="JWT signature mismatch")
    except jwt.MissingRequiredClaimError as err:
        raise HTTPException(status_code=401, detail=f"JWT missing claim: {err}")
    except jwt.InvalidTokenError as err:
        # Catch-all for malformed tokens, unsupported algs, etc.
        raise HTTPException(status_code=401, detail=f"JWT invalid: {err}")

    for key in ("tid", "role", "jid", "lifecycle"):
        if claims.get(key) in (None, ""):
            raise HTTPException(
                status_code=401, detail=f"JWT missing required claim '{key}'"
            )

    return TenantContext(
        tenant_id=str(claims["tid"]),
        practitioner_id=(str(claims["pid"]) if claims.get("pid") else None),
        role=str(claims["role"]),
        job_id=str(claims["jid"]),
        lifecycle_status=str(claims["lifecycle"]),
    )
