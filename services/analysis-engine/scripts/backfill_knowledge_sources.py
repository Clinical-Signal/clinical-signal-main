"""Backfill knowledge_sources rows for the historical clinical_knowledge corpus.

Pre-Phase-1, every clinical_knowledge row had source_id NULL because no
ingest path was creating knowledge_sources entries. This script groups
existing rows by source_channel, creates one knowledge_sources row per
channel (slack_thread shape, attributed to Dr. Laura since migration
0017 already set leader_id to her UUID on every row), then UPDATEs the
matching rows to point at that source.

Idempotent end-to-end:
  - get_or_create_source dedupes on (tenant_id, raw_text_hash) when a
    hash is supplied; this script supplies one (sha256 of a stable
    "backfill:{channel}:{count}" canonical string).
  - The UPDATE is guarded by source_id IS NULL, so a re-run touches no
    rows.

Usage:
    python scripts/backfill_knowledge_sources.py \
        --tenant 00000000-0000-0000-0000-000000000001
    python scripts/backfill_knowledge_sources.py --tenant <uuid> --dry-run
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

from app.knowledge.db import get_or_create_source, mark_source_extracted  # noqa: E402

DR_LAURA_SLUG = "dr-laura"


def _ctx(tenant_id: str, job_id: str) -> "TenantContext":
    """Build a TenantContext for this script's batch ops."""
    from app._core import TenantContext  # noqa: PLC0415

    return TenantContext(
        tenant_id=tenant_id,
        practitioner_id=None,
        role="system",
        job_id=job_id,
        lifecycle_status="active",
    )


def _resolve_leader_id(tenant_id: str, slug: str) -> str | None:
    from app._core import set_tenant_guc  # noqa: PLC0415

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        set_tenant_guc(conn, _ctx(tenant_id, "backfill_knowledge_sources:leader"))
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM knowledge_leaders "
                "WHERE tenant_id = %s AND slug = %s",
                (tenant_id, slug),
            )
            row = cur.fetchone()
            return str(row[0]) if row else None


def _channels_to_backfill(tenant_id: str) -> list[tuple[str, int]]:
    """Return [(source_channel, row_count), …] for rows still missing source_id."""
    from app._core import set_tenant_guc  # noqa: PLC0415

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        set_tenant_guc(conn, _ctx(tenant_id, "backfill_knowledge_sources:channels"))
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT source_channel, COUNT(*) AS n
                  FROM clinical_knowledge
                 WHERE tenant_id = %s
                   AND source_id IS NULL
                   AND source_channel IS NOT NULL
                 GROUP BY source_channel
                 ORDER BY n DESC, source_channel
                """,
                (tenant_id,),
            )
            return [(row[0], row[1]) for row in cur.fetchall()]


def _update_rows(tenant_id: str, channel: str, source_id: str) -> int:
    """UPDATE clinical_knowledge SET source_id where channel matches and
    source_id is still NULL. Returns the row count touched."""
    from app._core import set_tenant_guc  # noqa: PLC0415

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        set_tenant_guc(conn, _ctx(tenant_id, "backfill_knowledge_sources:update"))
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE clinical_knowledge
                   SET source_id = %s
                 WHERE tenant_id = %s
                   AND source_channel = %s
                   AND source_id IS NULL
                """,
                (source_id, tenant_id, channel),
            )
            updated = cur.rowcount
        conn.commit()
        return updated


def _final_audit(tenant_id: str) -> tuple[int, int]:
    """(rows_still_null_with_channel, rows_null_without_channel)."""
    from app._core import set_tenant_guc  # noqa: PLC0415

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        set_tenant_guc(conn, _ctx(tenant_id, "backfill_knowledge_sources:audit"))
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  COUNT(*) FILTER (WHERE source_id IS NULL AND source_channel IS NOT NULL),
                  COUNT(*) FILTER (WHERE source_id IS NULL AND source_channel IS NULL)
                FROM clinical_knowledge
                WHERE tenant_id = %s
                """,
                (tenant_id,),
            )
            return cur.fetchone()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tenant", required=True, help="Tenant UUID")
    ap.add_argument("--leader-slug", default=DR_LAURA_SLUG,
                    help="Leader slug to attribute backfilled sources to (default: dr-laura)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Show what would be created/updated, don't write")
    args = ap.parse_args()

    if "DATABASE_URL" not in os.environ:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2

    leader_id = _resolve_leader_id(args.tenant, args.leader_slug)
    if not leader_id:
        print(
            f"[backfill] WARN: no knowledge_leaders row for slug="
            f"{args.leader_slug!r} — created sources will have leader_id NULL",
            file=sys.stderr, flush=True,
        )

    channels = _channels_to_backfill(args.tenant)
    if not channels:
        print("[backfill] no channels need backfill — nothing to do")
        # Still report the final audit for visibility.
        null_with, null_without = _final_audit(args.tenant)
        print(f"[backfill] audit: orphan_with_channel={null_with} "
              f"orphan_without_channel={null_without}")
        return 0

    print(f"[backfill] channels to process: {len(channels)}")
    total_updated = 0
    sources_created_or_found = 0
    summary: list[tuple[str, str, int]] = []  # (channel, source_id_short, rows_updated)

    for channel, n in channels:
        # Deterministic raw_text_hash so re-running this backfill maps to
        # the same knowledge_sources row via the schema's UNIQUE
        # constraint. The "backfill:" prefix prevents collision with
        # real-content hashes from ingest_pdf/load_knowledge.
        raw_text_hash = hashlib.sha256(
            f"backfill:{channel}".encode("utf-8")
        ).hexdigest()

        if args.dry_run:
            print(f"[backfill] DRY: would create slack_thread source "
                  f"title={channel!r} → update {n} rows")
            continue

        source_id = get_or_create_source(
            _ctx(args.tenant, f"backfill_knowledge_sources:create:{channel}"),
            "slack_thread",
            title=channel,
            leader_id=leader_id,
            raw_text_hash=raw_text_hash,
            metadata={
                "backfilled": True,
                "entry_count_at_backfill": n,
            },
        )
        sources_created_or_found += 1
        updated = _update_rows(args.tenant, channel, source_id)
        mark_source_extracted(
            _ctx(args.tenant, f"backfill_knowledge_sources:mark:{channel}"),
            source_id,
            updated,
        )
        total_updated += updated
        summary.append((channel, source_id[:8], updated))
        print(f"[backfill] {channel:35s} src={source_id[:8]} updated={updated}")

    if args.dry_run:
        print(f"[backfill] DRY: would create/find {len(channels)} sources, "
              f"update {sum(n for _, n in channels)} rows total")
        return 0

    print()
    print(f"[backfill] sources processed: {sources_created_or_found}")
    print(f"[backfill] rows updated:      {total_updated}")
    print()

    null_with, null_without = _final_audit(args.tenant)
    print(f"[backfill] audit: orphan_with_channel={null_with} "
          f"orphan_without_channel={null_without}")
    if null_with > 0:
        print(
            f"[backfill] WARN: {null_with} rows still have source_id NULL "
            f"despite having a source_channel set — investigate",
            file=sys.stderr,
        )
        return 1

    # Machine-readable summary at the end so downstream verification can
    # parse it without scraping the print log above.
    print("[backfill] summary:", json.dumps([
        {"channel": c, "source_id_prefix": s, "rows_updated": r}
        for c, s, r in summary
    ]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
