"""SEC-11 — ClamAV byte scanner via clamd (TCP or Unix socket).

Scans raw upload bytes in memory before persistence. Never logs file
contents or scan payloads — only verdict metadata for operators.
"""

from __future__ import annotations

import io
import os
import socket
from dataclasses import dataclass
from enum import Enum


class ScanVerdict(str, Enum):
    CLEAN = "clean"
    INFECTED = "infected"
    ERROR = "error"


@dataclass(frozen=True)
class ScanResult:
    verdict: ScanVerdict
    signature: str | None = None
    detail: str | None = None


def _clamd_client():
    import clamd

    unix_path = os.environ.get("CLAMD_UNIX_SOCKET", "").strip()
    if unix_path:
        return clamd.ClamdUnixSocket(path=unix_path)

    host = os.environ.get("CLAMD_HOST", "127.0.0.1")
    port = int(os.environ.get("CLAMD_PORT", "3310"))
    timeout = int(os.environ.get("CLAMD_TIMEOUT_SEC", "60"))
    return clamd.ClamdNetworkSocket(host=host, port=port, timeout=timeout)


def scan_bytes(b: bytes) -> ScanResult:
    """Scan a byte buffer with clamd INSTREAM. No disk write."""
    if not b:
        return ScanResult(verdict=ScanVerdict.ERROR, detail="empty_input")

    try:
        client = _clamd_client()
        raw = client.instream(io.BytesIO(b))
    except (OSError, socket.error) as exc:
        return ScanResult(verdict=ScanVerdict.ERROR, detail="clamd_unreachable")
    except Exception:
        # clamd library raises clamd.ConnectionError / ResponseError — keep
        # the response PHI-free (no echo of scanned bytes).
        return ScanResult(verdict=ScanVerdict.ERROR, detail="clamd_error")

    status, signature = raw.get("stream", ("ERROR", None))
    if status == "OK":
        return ScanResult(verdict=ScanVerdict.CLEAN)
    if status == "FOUND":
        return ScanResult(
            verdict=ScanVerdict.INFECTED,
            signature=str(signature) if signature else "unknown",
        )
    return ScanResult(verdict=ScanVerdict.ERROR, detail=str(status))
