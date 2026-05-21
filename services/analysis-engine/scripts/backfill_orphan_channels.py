"""Backfill source_channel on clinical_knowledge rows that lost their _source envelope.

Some early v2-ingest JSONLs (clientfeedbackrequests-v2.jsonl,
booksandresources-v2.jsonl, livecallschedule-topics-v2.jsonl,
announcements-v2.jsonl, call_replays-v2.jsonl,
products-and-brands-we-love-v2.jsonl, hormoneai-v2.jsonl) produced
entries without the standard `_source` block. When loaded those rows
landed with source_channel = NULL and zero hints in their metadata
blob. This script identifies those rows by sha256(content) match
against the seed JSONLs and sets source_channel from the filename.

Runs in two paths:

  Path A — scan a single JSONL (--file). Useful when you know exactly
  which file produced orphans.

  Path B — scan every *.jsonl in --seed-dir (default
  database/seed/knowledge/), skip "combined" / "all-*" aggregate files
  so we don't double-credit the same hash to the aggregate name.

After running this you typically also re-run
backfill_knowledge_sources.py to mint knowledge_sources rows for the
newly-channeled rows.

Usage:
    python scripts/backfill_orphan_channels.py \
        --tenant 00000000-0000-0000-0000-000000000001 \
        [--seed-dir /knowledge_out] \
        [--file /knowledge_out/clientfeedbackrequests-v2.jsonl] \
        [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

# Skip these files during full-dir scans — they're aggregations, not
# single-channel sources.
EXCLUDE_PATTERNS = (
    re.compile(r"combined", re.IGNORECASE),
    re.compile(r"^all[-_]", re.IGNORECASE),
)


def _channel_from_filename(jsonl_name: str) -> str:
    """Strip `.jsonl` and trailing `-v2` / `-v1` / `-smoke` suffixes."""
    base = jsonl_name
    for suffix in (".jsonl",):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    for trail in ("-v2", "-v1", "-smoke", "-test"):
        if base.endswith(trail):
            base = base[: -len(trail)]
    return base


def _orphan_hashes(tenant_id: str) -> set[str]:
    """Pull the set of item_content_hash values for rows with NULL channel."""
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)",
                (tenant_id,),
            )
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT item_content_hash FROM clinical_knowledge
                 WHERE tenant_id = %s
                   AND source_channel IS NULL
                """,
                (tenant_id,),
            )
            return {row[0] for row in cur.fetchall()}


def _scan_file(jsonl_path: Path, orphan_hashes: set[str]) -> list[str]:
    """Return list of item_content_hashes from `jsonl_path` that match orphans."""
    matches: list[str] = []
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            content = obj.get("content", "")
            h = hashlib.sha256(content.encode("utf-8")).hexdigest()
            if h in orphan_hashes:
                matches.append(h)
    return matches


def _update_rows(
    tenant_id: str, hashes: list[str], channel: str,
) -> int:
    """Set source_channel on rows matching the given hashes (only when NULL)."""
    if not hashes:
        return 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)",
                (tenant_id,),
            )
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE clinical_knowledge
                   SET source_channel = %s
                 WHERE tenant_id = %s
                   AND item_content_hash = ANY(%s)
                   AND source_channel IS NULL
                """,
                (channel, tenant_id, hashes),
            )
            updated = cur.rowcount
        conn.commit()
        return updated


def _final_audit(tenant_id: str) -> tuple[int, int]:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)",
                (tenant_id,),
            )
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  COUNT(*) FILTER (WHERE source_channel IS NOT NULL),
                  COUNT(*) FILTER (WHERE source_channel IS NULL)
                FROM clinical_knowledge
                WHERE tenant_id = %s
                """,
                (tenant_id,),
            )
            return cur.fetchone()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tenant", required=True)
    ap.add_argument(
        "--seed-dir",
        default="/knowledge_out",
        help="Directory of *.jsonl files to scan (default: /knowledge_out)",
    )
    ap.add_argument(
        "--file", default=None,
        help="Scan a single JSONL instead of the whole seed-dir",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if "DATABASE_URL" not in os.environ:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2

    orphan_hashes = _orphan_hashes(args.tenant)
    print(f"[orphan-channels] orphan rows: {len(orphan_hashes)}")
    if not orphan_hashes:
        print("[orphan-channels] no orphans — nothing to do")
        return 0

    # Resolve scan list.
    if args.file:
        files = [Path(args.file)]
    else:
        seed = Path(args.seed_dir)
        if not seed.exists():
            print(f"[orphan-channels] seed-dir not found: {seed}", file=sys.stderr)
            return 2
        files = []
        for p in sorted(seed.glob("*.jsonl")):
            if any(rx.search(p.name) for rx in EXCLUDE_PATTERNS):
                print(f"[orphan-channels] skipping aggregate file: {p.name}")
                continue
            files.append(p)

    matched_files: dict[str, tuple[str, list[str]]] = {}  # path → (channel, hashes)
    for p in files:
        hashes = _scan_file(p, orphan_hashes)
        if hashes:
            matched_files[str(p)] = (_channel_from_filename(p.name), hashes)

    if not matched_files:
        print("[orphan-channels] no JSONL files contain matching content hashes")
        return 0

    # Sanity: report any orphans that overlap across multiple files.
    hash_to_files: dict[str, list[str]] = defaultdict(list)
    for fpath, (_channel, hashes) in matched_files.items():
        for h in hashes:
            hash_to_files[h].append(fpath)
    multi = {h: fs for h, fs in hash_to_files.items() if len(fs) > 1}
    if multi:
        print(
            f"[orphan-channels] WARN: {len(multi)} hashes appear in >1 file — "
            f"first match wins per file iteration order",
            file=sys.stderr,
        )

    total_updated = 0
    summary: list[tuple[str, str, int]] = []
    for fpath, (channel, hashes) in matched_files.items():
        fname = Path(fpath).name
        if args.dry_run:
            print(f"[orphan-channels] DRY: would set channel={channel!r} "
                  f"on {len(hashes)} rows from {fname}")
            continue
        updated = _update_rows(args.tenant, hashes, channel)
        total_updated += updated
        summary.append((fname, channel, updated))
        print(f"[orphan-channels] {fname:50s} channel={channel:35s} updated={updated}")

    if args.dry_run:
        print(
            f"[orphan-channels] DRY: would update {sum(len(h) for _, h in matched_files.values())} "
            f"rows across {len(matched_files)} files"
        )
        return 0

    print()
    print(f"[orphan-channels] files processed: {len(matched_files)}")
    print(f"[orphan-channels] rows updated:    {total_updated}")

    with_channel, without_channel = _final_audit(args.tenant)
    print(f"[orphan-channels] audit: rows_with_channel={with_channel} "
          f"rows_without_channel={without_channel}")

    if summary:
        print("[orphan-channels] summary:", json.dumps([
            {"file": f, "channel": c, "rows_updated": n}
            for f, c, n in summary
        ]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
