"""Retroactively score faithfulness on existing clinical_knowledge entries.

C.1.4 follow-up — optional. Pre-C.1.4 entries (faithfulness_score IS NULL)
were ingested before the second-pass quality check existed. This script
re-runs the faithfulness check against their original source chunks and
writes the score back.

NOT run by default. Cost: roughly $3-5 to retro the existing 1,144
entries on the dev DB (one Sonnet call per entry, ~500-1000 input tokens
+ ~100 output tokens each). Run when retrieval quality issues surface in
the corpus, not as part of routine ingestion.

Usage (inside the analysis-engine container):
    python scripts/recompute_faithfulness.py \\
        --channels-dir /laura_channels \\
        [--chunk-size 8] [--dry-run] [--limit N]

Requires the same channel-export .txt files that the original ingestion
ran on, mounted at --channels-dir. The script replicates the
load_messages → chunk_messages → hash_chunk pipeline from
ingest_knowledge.py to rebuild a source_chunk_hash → chunk_text index,
then matches existing rows by source_chunk_hash. Entries whose hash is
not in the index are skipped (the channel file is missing or has been
edited since ingestion).

Idempotent: only touches rows where faithfulness_score IS NULL.
Tenant-scoped: per-tenant via app.current_tenant_id.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Make `app.*` and sibling-script imports work when invoked from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402
from anthropic import Anthropic  # noqa: E402

# Reuse the canonical chunking + scoring helpers from ingest_knowledge.py
# so retro and live ingestion compute byte-identical hashes and run the
# same faithfulness pass.
from scripts.ingest_knowledge import (  # noqa: E402
    FAITHFULNESS_PROMPT_PATH,
    REJECT_THRESHOLD,
    REVIEW_THRESHOLD,
    chunk_messages,
    evaluate_faithfulness,
    faithfulness_bucket,
    hash_chunk,
    load_messages,
)


def build_chunk_index(channels_dir: Path, chunk_size: int) -> dict[str, str]:
    """Walk every .txt in `channels_dir`, replicate the ingest chunking,
    and return a dict mapping source_chunk_hash → chunk_text."""
    index: dict[str, str] = {}
    for txt in sorted(channels_dir.glob("*.txt")):
        msgs = load_messages(txt)
        chunks = chunk_messages(msgs, chunk_size)
        for chunk in chunks:
            text = "\n\n---\n\n".join(chunk)
            index[hash_chunk(text)] = text
    return index


def reconstruct_entry_for_check(row: dict) -> dict:
    """Stitch the DB row back into a dict shaped like the JSONL items the
    faithfulness prompt expects (only the substantive content fields)."""
    md = row.get("metadata") or {}
    return {
        "category": row.get("category"),
        "title": row.get("title"),
        "content": row.get("content"),
        "conditions": md.get("conditions") or [],
        "symptoms": md.get("symptoms") or [],
        "lab_markers": md.get("lab_markers") or [],
        "supplements": md.get("supplements") or [],
        "sequencing_notes": md.get("sequencing_notes"),
        "contraindications": md.get("contraindications") or [],
        "clinical_reasoning": md.get("clinical_reasoning"),
    }


def fetch_tenants(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tenants ORDER BY id")
        return [str(r[0]) for r in cur.fetchall()]


def fetch_unscored(conn: psycopg.Connection) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, source_chunk_hash, category, title, content, metadata
              FROM clinical_knowledge
             WHERE faithfulness_score IS NULL
               AND source_chunk_hash IS NOT NULL
             ORDER BY created_at
            """
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def write_score(conn: psycopg.Connection, row_id: str, fcheck: dict, bucket: str) -> None:
    """Persist faithfulness columns. If the bucket is 'reject' or
    'review', also flip review_status — but only when it's still the
    default 'unreviewed', so we don't overwrite a human-applied status."""
    new_status = (
        "rejected" if bucket == "reject"
        else "pending_review" if bucket == "review"
        else None
    )
    import json as _json
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE clinical_knowledge
               SET faithfulness_score = %s,
                   faithfulness_breakdown = %s::jsonb,
                   faithfulness_notes = %s,
                   review_status = CASE
                       WHEN %s IS NOT NULL AND review_status = 'unreviewed' THEN %s
                       ELSE review_status
                   END
             WHERE id = %s
            """,
            (
                fcheck["faithfulness_score"],
                _json.dumps(fcheck["faithfulness_breakdown"]),
                fcheck["faithfulness_notes"],
                new_status, new_status,
                row_id,
            ),
        )
    conn.commit()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--channels-dir", required=True, type=Path,
                    help="Directory containing the original .txt channel exports.")
    ap.add_argument("--chunk-size", type=int, default=8,
                    help="Must match the chunk-size used at original ingestion.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Compute and report scores without writing back.")
    ap.add_argument("--limit", type=int, default=0,
                    help="Cap rows processed per tenant (0 = all).")
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2
    if not args.channels_dir.exists():
        print(f"channels-dir not found: {args.channels_dir}", file=sys.stderr)
        return 2

    print(
        f"[retro] indexing chunks from {args.channels_dir} "
        f"(chunk_size={args.chunk_size}) ...",
        flush=True,
    )
    index = build_chunk_index(args.channels_dir, args.chunk_size)
    print(f"[retro] indexed {len(index)} unique chunks", flush=True)

    client = Anthropic(api_key=api_key)
    system_prompt = FAITHFULNESS_PROMPT_PATH.read_text(encoding="utf-8")

    totals = {"scored": 0, "no_source": 0, "failed": 0,
              "reject": 0, "review": 0, "clean": 0}
    start = time.time()

    # Local import to keep the import block at module-load time small —
    # this script is also imported by post_ingest_finalize for its
    # type-only references when running inside the engine, so we avoid
    # pulling in the full _core surface there.
    from app._core import TenantContext, set_tenant_guc  # noqa: PLC0415

    conn = psycopg.connect(db_url, autocommit=False)
    try:
        for tenant_id in fetch_tenants(conn):
            ctx = TenantContext(
                tenant_id=tenant_id,
                practitioner_id=None,
                role="system",
                job_id="recompute_faithfulness",
                lifecycle_status="active",
            )
            set_tenant_guc(conn, ctx)
            conn.commit()

            rows = fetch_unscored(conn)
            if args.limit:
                rows = rows[: args.limit]
            print(
                f"[retro] tenant {tenant_id}: {len(rows)} rows missing faithfulness",
                flush=True,
            )

            for row in rows:
                chunk_text = index.get(row["source_chunk_hash"])
                if chunk_text is None:
                    totals["no_source"] += 1
                    continue
                try:
                    fcheck = evaluate_faithfulness(
                        client, system_prompt, chunk_text,
                        reconstruct_entry_for_check(row),
                    )
                except Exception as err:
                    print(
                        f"[retro] FAILED row {row['id']}: "
                        f"{type(err).__name__}: {err}",
                        file=sys.stderr,
                        flush=True,
                    )
                    totals["failed"] += 1
                    continue

                bucket = faithfulness_bucket(fcheck["faithfulness_score"])
                totals[bucket] += 1
                totals["scored"] += 1
                if not args.dry_run:
                    write_score(conn, str(row["id"]), fcheck, bucket)

                if totals["scored"] % 25 == 0:
                    print(
                        f"[retro] scored={totals['scored']} "
                        f"clean={totals['clean']} review={totals['review']} "
                        f"reject={totals['reject']} no_source={totals['no_source']} "
                        f"failed={totals['failed']} "
                        f"elapsed={time.time() - start:.1f}s",
                        flush=True,
                    )
    finally:
        conn.close()

    print()
    print(f"[retro] DONE in {time.time() - start:.1f}s "
          f"(thresholds reject<{REJECT_THRESHOLD} review<{REVIEW_THRESHOLD})")
    print(f"[retro]   scored:    {totals['scored']}"
          f"{' (dry-run, 0 written)' if args.dry_run else ''}")
    print(f"[retro]   clean:     {totals['clean']}")
    print(f"[retro]   review:    {totals['review']}")
    print(f"[retro]   reject:    {totals['reject']}")
    print(f"[retro]   no_source: {totals['no_source']} "
          f"(chunk hash not in --channels-dir; can't retro)")
    print(f"[retro]   failed:    {totals['failed']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
