"""Sweep clinical_knowledge into knowledge_review_queue for Dr. Laura's review.

C.1.5 from docs/MVP-PRIORITIZATION-2026-05-08.md (Layer C). Standalone
batch runner — same pattern as recompute_confidence.py. Idempotent: the
underlying enqueue_review_items function uses NOT EXISTS to skip rows
already queued for the same review_type.

Use this:
- After a fresh recompute_confidence.py run (scores changed → flag set
  changed)
- After a backfill of faithfulness on legacy entries (recompute_faithfulness.py)
- Anytime you want to re-sync the review queue against current
  clinical_knowledge state

The post-load hook in load_knowledge.py covers the routine case (every
new ingestion auto-enqueues), so this script is for batch / catch-up
operations rather than the steady-state path.

Usage (inside the analysis-engine container):
    python scripts/enqueue_review.py [--threshold 0.75]

Requires DATABASE_URL.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Make `app.*` imports work when invoked from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

from app.knowledge.db import (  # noqa: E402
    LOW_CONFIDENCE_THRESHOLD,
    enqueue_review_items,
)


def fetch_tenants(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tenants ORDER BY id")
        return [str(r[0]) for r in cur.fetchall()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--threshold", type=float, default=LOW_CONFIDENCE_THRESHOLD,
        help=(
            f"Composite confidence_score below this value flags "
            f"'low_confidence' review (default {LOW_CONFIDENCE_THRESHOLD})."
        ),
    )
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2

    grand = {"low_confidence": 0, "low_faithfulness": 0}
    start = time.time()

    from app._core import TenantContext, set_tenant_guc  # noqa: PLC0415

    conn = psycopg.connect(db_url, autocommit=False)
    try:
        tenants = fetch_tenants(conn)
        print(
            f"[enqueue] tenants discovered: {len(tenants)} "
            f"(threshold={args.threshold})",
            flush=True,
        )

        for tenant_id in tenants:
            ctx = TenantContext(
                tenant_id=tenant_id,
                practitioner_id=None,
                role="system",
                job_id="enqueue_review",
                lifecycle_status="active",
            )
            set_tenant_guc(conn, ctx)
            conn.commit()

            counts = enqueue_review_items(conn, ctx, args.threshold)
            print(
                f"[enqueue] tenant {tenant_id}: "
                f"low_confidence={counts['low_confidence']} "
                f"low_faithfulness={counts['low_faithfulness']}",
                flush=True,
            )
            for k, v in counts.items():
                grand[k] += v
    finally:
        conn.close()

    print()
    print(f"[enqueue] DONE in {time.time() - start:.1f}s")
    print(f"[enqueue]   total enqueued (this run, excludes duplicates):")
    print(f"     low_confidence    {grand['low_confidence']}")
    print(f"     low_faithfulness  {grand['low_faithfulness']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
