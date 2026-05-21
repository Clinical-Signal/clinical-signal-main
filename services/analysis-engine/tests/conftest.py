"""Test configuration shared across the analysis-engine pytest suite.

Sets ENGINE_JWT_SECRET to a fixed test value before any test imports
the auth module. This way:
  - The require_engine_jwt dependency reads a non-empty secret.
  - Tests can sign with the same value via the helper in test_auth.py
    without needing to coordinate via env on the test runner.
"""
import os
import sys
from pathlib import Path

# Make the engine package importable regardless of where pytest is
# invoked from. Mirrors the `python -m pytest services/analysis-engine`
# entry point used in CI.
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

os.environ.setdefault(
    "ENGINE_JWT_SECRET",
    "test_engine_jwt_secret_at_least_32_chars_long_for_hs256",
)
