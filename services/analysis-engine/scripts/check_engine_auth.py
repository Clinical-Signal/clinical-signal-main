#!/usr/bin/env python3
"""CI grep gate — refuses to ship if the engine's HTTP surface ever
regresses below the PR5 contract.

Two hard rules, both enforced by static inspection of main.py:

  1. Every `@app.<verb>(...)` route handler EXCEPT the health check
     must take a `TenantContext`-yielding `Depends(require_engine_jwt)`
     parameter. A handler that forgets the dependency is silently
     unauthenticated — the engine would happily serve PHI to any
     caller that can reach the port.

  2. No request-body Pydantic model in main.py declares a `tenant_id`
     or `practitioner_id` field. Both flow from the verified JWT
     claims; accepting them in the body is the exact loophole PR5
     exists to close.

Both rules are intentionally implemented with `re` rather than the
`ast` module — the regexes are simple, the failure modes are obvious,
and a reviewer who sees a regex they don't trust can run the script
locally and read main.py themselves.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# We only enforce these rules on main.py — that's the entire HTTP
# surface. Other files in app/ are internal helpers and are allowed
# to mention `tenant_id` freely (e.g., when binding it as a SQL
# parameter under tenant_conn).
ENGINE_DIR = Path(__file__).resolve().parents[1]
MAIN_PY = ENGINE_DIR / "app" / "main.py"

# Routes that are intentionally unauthenticated. Only /health belongs
# here — it's used by docker-compose, ALB target groups, and the
# k8s readiness probe. Anything else added to this list needs a
# review comment justifying it.
UNAUTH_PATHS = frozenset({"/health"})


def main() -> int:
    if not MAIN_PY.exists():
        print(f"::error::expected {MAIN_PY} but it doesn't exist", file=sys.stderr)
        return 1

    src = MAIN_PY.read_text(encoding="utf-8")
    failed = False

    # ---- Rule 1: every route uses Depends(require_engine_jwt). -------------
    #
    # Capture each `@app.<verb>("<path>")` decorator, then look at the
    # following def's parameter list. A route is conformant iff that
    # parameter list contains "Depends(require_engine_jwt)" (the
    # EngineCtx alias resolves to that same call — we look for either).
    route_block = re.compile(
        r'@app\.(?P<verb>get|post|put|patch|delete)\(\s*"(?P<path>[^"]+)"'
        r'.*?'
        r'^async def \w+\((?P<params>.*?)\)\s*->',
        re.DOTALL | re.MULTILINE,
    )
    matches = list(route_block.finditer(src))
    if not matches:
        print("::error::check_engine_auth.py couldn't find any route handlers in main.py", file=sys.stderr)
        return 1

    for m in matches:
        path = m.group("path")
        params = m.group("params")
        if path in UNAUTH_PATHS:
            continue
        # Accept either the explicit Depends call or the EngineCtx alias.
        # Both resolve to the same dependency at FastAPI graph time.
        has_dep = ("Depends(require_engine_jwt)" in params) or ("EngineCtx" in params)
        if not has_dep:
            failed = True
            print(
                f"::error::route {path!r} in main.py is missing "
                f"Depends(require_engine_jwt) / EngineCtx — "
                f"it would be reachable without authentication.",
                file=sys.stderr,
            )

    # ---- Rule 2: no Pydantic model exposes tenant_id / practitioner_id. ---
    #
    # Scope to lines that look like Pydantic field declarations inside
    # a class body. We look for `tenant_id` or `practitioner_id` on
    # the LHS of a `:` (type annotation) at module scope-or-deeper
    # indentation. False positives are unlikely in main.py since the
    # only place those names appear in the DAG of allowed code is
    # inside a TenantContext (which we already ban from request
    # bodies by virtue of those models extending BaseModel, not
    # TenantContext).
    forbidden_field = re.compile(
        r"^\s+(tenant_id|practitioner_id)\s*:\s*str", re.MULTILINE
    )
    for fld in forbidden_field.finditer(src):
        # Walk back to find the nearest `class X(BaseModel):` line.
        upto = src[: fld.start()]
        class_match = list(
            re.finditer(r"^class\s+(\w+)\s*\(\s*BaseModel\s*\)\s*:", upto, re.MULTILINE)
        )
        if not class_match:
            continue
        cls = class_match[-1].group(1)
        line_no = src.count("\n", 0, fld.start()) + 1
        failed = True
        print(
            f"::error::main.py:{line_no} — Pydantic model {cls} declares "
            f"`{fld.group(1)}: str`. PR5 requires that field to flow from "
            f"the JWT (ctx.{fld.group(1)}), not the request body.",
            file=sys.stderr,
        )

    if failed:
        return 1
    print(
        f"engine HTTP surface OK: {len(matches)} routes inspected, "
        f"{len(matches) - len(UNAUTH_PATHS & {m.group('path') for m in matches})} "
        f"authenticated, no tenant_id leakage in request models."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
