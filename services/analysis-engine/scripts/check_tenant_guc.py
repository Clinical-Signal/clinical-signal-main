#!/usr/bin/env python3
"""CI grep gate for the analysis engine: refuses to ship if any file
outside services/analysis-engine/app/_core/db.py contains the literal
string ``set_config('app.current_tenant_id'``.

PR4 routes every RLS-context setup through ``app._core.db`` — either
``tenant_conn(ctx)`` (preferred) or ``set_tenant_guc(conn, ctx)`` (for
scripts that own their own connection lifecycle). Direct calls to
``SELECT set_config('app.current_tenant_id', …)`` outside that module
are a regression and this gate catches them at PR time.

Mirrors the TS-side gate at apps/web/scripts/check-system-access.mjs
(PR3) which enforces the equivalent invariant for ``withSystem``.

Exit codes:
    0 — clean
    1 — at least one violation; details printed to stderr
    2 — invocation error (no files found / wrong cwd)
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# The needle. We search for the call signature, not just the GUC name,
# because the GUC name appears in comments / docstrings too and those
# are fine. set_tenant_guc / tenant_conn / system_conn callers don't
# include this literal — they delegate to _core/db.py.
NEEDLE = re.compile(r"set_config\('app\.current_tenant_id'")

# The single sanctioned site.
ALLOWED_FILE = (
    "services/analysis-engine/app/_core/db.py"
)

# Search root: services/analysis-engine. Run from the repo root.
ROOT = Path(__file__).resolve().parents[1]


def iter_python_files() -> list[Path]:
    """Walk the engine tree and return every .py file we should scan.

    Skips __pycache__, .venv, build artifacts, and the gate script
    itself (its docstring legitimately documents the literal).
    """
    skip_dirs = {"__pycache__", ".venv", "venv", "build", "dist", ".pytest_cache"}
    files: list[Path] = []
    self_path = Path(__file__).resolve()
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".")]
        for name in filenames:
            if not name.endswith(".py"):
                continue
            full = Path(dirpath) / name
            if full.resolve() == self_path:
                continue
            files.append(full)
    return files


def main() -> int:
    files = iter_python_files()
    if not files:
        print(
            "[check_tenant_guc] no .py files found under "
            f"{ROOT} — wrong working directory?",
            file=sys.stderr,
        )
        return 2

    # Resolve the allow-listed file path against the repo root so we
    # can compare absolute paths cleanly. The gate is run from the
    # repo root in CI; locally `python scripts/check_tenant_guc.py`
    # also works since ROOT is computed from __file__.
    repo_root = ROOT.parents[1]
    allowed_abs = (repo_root / ALLOWED_FILE).resolve()

    violations: list[tuple[Path, int, str]] = []
    for f in files:
        try:
            text = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if not NEEDLE.search(text):
            continue
        if f.resolve() == allowed_abs:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if NEEDLE.search(line):
                violations.append((f, lineno, line.strip()))

    if violations:
        print(
            "[check_tenant_guc] VIOLATIONS — set_config('app.current_tenant_id', ...)\n"
            f"is forbidden outside {ALLOWED_FILE}.\n"
            "Use app._core.tenant_conn(ctx) (preferred) or\n"
            "app._core.set_tenant_guc(conn, ctx) when you own the conn.\n",
            file=sys.stderr,
        )
        for path, lineno, line in violations:
            try:
                rel = path.relative_to(repo_root)
            except ValueError:
                rel = path
            print(f"  {rel}:{lineno}: {line}", file=sys.stderr)
        print(
            f"\n[check_tenant_guc] {len(violations)} violation(s) "
            f"across {len({v[0] for v in violations})} file(s).",
            file=sys.stderr,
        )
        return 1

    print(
        "[check_tenant_guc] OK — set_config('app.current_tenant_id') "
        f"appears only in {ALLOWED_FILE}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
