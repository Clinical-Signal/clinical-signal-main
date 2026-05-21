"""Unit tests for app._core.auth.require_engine_jwt.

These tests don't touch the DB or run the full FastAPI stack — they
exercise the dependency function directly. The route-level integration
(does every endpoint actually call this dependency?) is enforced by
the grep gate at scripts/check_engine_auth.py and verified end-to-end
by the smoke test in the PR description.

Test matrix:
  1. valid JWT round-trip                -> returns TenantContext
  2. missing Authorization header        -> 401
  3. wrong scheme (Basic / no Bearer)    -> 401
  4. malformed JWT (not 3 segments)      -> 401
  5. bad HMAC signature                  -> 401
  6. expired JWT                         -> 401
  7. unsupported alg (none)              -> 401
  8. missing required claim              -> 401
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi import HTTPException

from app._core.auth import require_engine_jwt


SECRET = os.environ["ENGINE_JWT_SECRET"]


# ---------------------------------------------------------------------------
# Local helpers — we hand-roll the JWT instead of pulling the TS-side
# signer into pytest. Keeps the test independent of the web tier and
# makes it easy to construct deliberately broken tokens for negative
# cases.
# ---------------------------------------------------------------------------


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _make_jwt(
    *,
    tid: str = "11111111-1111-1111-1111-111111111111",
    pid: str | None = "22222222-2222-2222-2222-222222222222",
    role: str = "practitioner",
    jid: str = "test_job",
    lifecycle: str = "active",
    iat_offset: int = 0,
    ttl: int = 300,
    secret: str = SECRET,
    alg: str = "HS256",
    skip_claims: tuple[str, ...] = (),
    tamper_signature: bool = False,
) -> str:
    now = int(time.time()) + iat_offset
    header = {"alg": alg, "typ": "JWT"}
    claims = {
        "tid": tid,
        "pid": pid,
        "role": role,
        "jid": jid,
        "lifecycle": lifecycle,
        "iat": now,
        "exp": now + ttl,
    }
    for k in skip_claims:
        claims.pop(k, None)

    h_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    c_b64 = _b64url(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{h_b64}.{c_b64}"

    if alg == "HS256":
        sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    else:
        sig = b""

    if tamper_signature:
        sig = sig[:-1] + bytes([(sig[-1] ^ 0xFF) & 0xFF]) if sig else b"\x00"

    return f"{signing_input}.{_b64url(sig)}"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_valid_jwt_returns_tenant_context() -> None:
    token = _make_jwt()
    ctx = require_engine_jwt(authorization=f"Bearer {token}")
    assert ctx.tenant_id == "11111111-1111-1111-1111-111111111111"
    assert ctx.practitioner_id == "22222222-2222-2222-2222-222222222222"
    assert ctx.role == "practitioner"
    assert ctx.job_id == "test_job"
    assert ctx.lifecycle_status == "active"


def test_valid_jwt_with_no_practitioner() -> None:
    """System jobs sign with pid=None. The dependency should accept
    that and surface practitioner_id as None — routes that need a
    practitioner (like /analyze) check for it and 400 explicitly."""
    token = _make_jwt(pid=None)
    ctx = require_engine_jwt(authorization=f"Bearer {token}")
    assert ctx.practitioner_id is None


def test_missing_authorization_header() -> None:
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=None)
    assert exc.value.status_code == 401


def test_wrong_scheme() -> None:
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization="Basic dXNlcjpwYXNz")
    assert exc.value.status_code == 401


def test_bearer_with_empty_token() -> None:
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization="Bearer ")
    assert exc.value.status_code == 401


def test_malformed_jwt_not_three_segments() -> None:
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization="Bearer not.a.real.jwt")
    assert exc.value.status_code == 401


def test_bad_signature() -> None:
    token = _make_jwt(tamper_signature=True)
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401
    assert "signature" in exc.value.detail.lower() or "invalid" in exc.value.detail.lower()


def test_expired_jwt() -> None:
    # Issued 10 minutes ago with a 1-second TTL. Even with the 30s
    # leeway the dep allows, this is well past exp.
    token = _make_jwt(iat_offset=-600, ttl=1)
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401


def test_wrong_secret() -> None:
    """A token signed under a different secret must not validate.
    Mirrors the 'web and engine secrets out of sync' failure mode."""
    token = _make_jwt(secret="some_completely_different_secret_value_xyz")
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401


def test_unsupported_alg_none_is_rejected() -> None:
    """Defends against the classic 'alg: none' downgrade attack —
    PyJWT defaults to no algorithms accepted, but we pin to HS256
    explicitly. A token claiming `alg: none` must be rejected."""
    token = _make_jwt(alg="none")
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401


def test_missing_required_claim_role() -> None:
    token = _make_jwt(skip_claims=("role",))
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401


def test_missing_required_claim_tid() -> None:
    token = _make_jwt(skip_claims=("tid",))
    with pytest.raises(HTTPException) as exc:
        require_engine_jwt(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401
