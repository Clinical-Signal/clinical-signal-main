"""SEC-11 — ClamAV scanner tests (requires running clamd).

Run with clamd up (docker compose includes infrastructure/docker/docker-compose.av.yml):

    docker compose up -d clamd
    cd services/analysis-engine && python -m pytest tests/test_av.py -v
"""

from __future__ import annotations

import pytest

from app.ingest.av import ScanResult, ScanVerdict, scan_bytes

# Standard EICAR test string — not live malware; used only for AV self-test.
EICAR = (
    b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
)


def _require_clamd() -> None:
    probe = scan_bytes(b"ping")
    if probe.verdict == ScanVerdict.ERROR:
        pytest.skip(f"clamd not reachable: {probe.detail}")


def test_eicar_detected() -> None:
    _require_clamd()
    result: ScanResult = scan_bytes(EICAR)
    assert result.verdict == ScanVerdict.INFECTED
    assert result.signature


def test_clean_pdf_like_bytes() -> None:
    _require_clamd()
    sample = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    result = scan_bytes(sample)
    assert result.verdict == ScanVerdict.CLEAN


def test_empty_input_errors_without_clamd() -> None:
    result = scan_bytes(b"")
    assert result.verdict == ScanVerdict.ERROR
    assert result.detail == "empty_input"
