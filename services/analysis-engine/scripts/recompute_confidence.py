"""Recompute composite confidence_score for every clinical_knowledge entry.

C.1.3 from docs/MVP-PRIORITIZATION-2026-05-08.md (Layer C). One-shot
backfill — wiring confidence-scoring into the live ingestion pipeline is
a separate item (part of C.1.4).

Formula (per docs/knowledge-orchestrator/knowledge-schema-design.md and
the C.1.3 task spec):

    confidence_score = (source_authority × 0.3)
                     + (corroboration    × 0.3)
                     + (recency          × 0.1)
                     + (review_bonus     × 0.3)

Idempotent: re-running overwrites with the same values for the same
input data. Tenant-scoped: corroboration is computed within a tenant.

Usage (inside the analysis-engine container):
    python scripts/recompute_confidence.py [--dry-run] [--limit N]

Requires DATABASE_URL.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Make `app.*` imports work when invoked from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

# --- Tunable factor parameters --------------------------------------------
# These are the starting values from the C.1.3 task spec. Tune in a
# follow-up once we have data on how the distribution lands. Surfaced as
# module constants so a tuning PR is a one-line diff.

# Cosine-similarity threshold above which two entries count as
# "corroborating" each other. The C.1.3 spec calls out 0.85 as the
# starting heuristic.
CORROBORATION_SIMILARITY = 0.85

# Divisor that maps raw corroboration count to the [0, 1] factor.
# 10+ corroborating entries → 1.0.
CORROBORATION_DIVISOR = 10.0

# Recency: linear decay over RECENCY_HALFLIFE_YEARS, floored at 0.
RECENCY_HALFLIFE_YEARS = 5.0

# Source authority — see compute_source_authority() below.
SOURCE_AUTHORITY_INTERNAL = 1.00       # leader.is_internal
SOURCE_AUTHORITY_IN_DOMAIN = 0.85      # external + entry domain ∈ leader.authority_domains
SOURCE_AUTHORITY_OUT_DOMAIN = 0.65     # external + no domain overlap
SOURCE_AUTHORITY_NO_LEADER = 0.50      # leader_id IS NULL (defensive)

# Review bonus — semantic mapping from the actual DB enum to the
# C.1.3 spec's intent. The DB enum is
# {unreviewed, pending_review, approved, corrected, rejected}; the spec
# references {reviewed_approved, reviewed_edited, unreviewed, flagged,
# reviewed_rejected}. Mapping is documented in the PR description.
REVIEW_BONUS: dict[str, float] = {
    "approved":       1.00,
    "corrected":      0.85,   # Dr. Laura touched it but didn't reject
    "unreviewed":     0.50,   # current state for all 1,144 entries
    "pending_review": 0.50,   # queued for review, no signal yet
    "rejected":       0.00,
}
REVIEW_BONUS_DEFAULT = 0.50

# Composite weights — must sum to 1.0.
W_AUTHORITY = 0.30
W_CORROBORATION = 0.30
W_RECENCY = 0.10
W_REVIEW = 0.30

BATCH_SIZE = 50


# --- Computation ----------------------------------------------------------

def compute_source_authority(
    is_internal: bool | None,
    authority_domains: list[str] | None,
    entry_domains: list[str],
) -> float:
    """Take the max source_authority across the entry's domain tags.

    Internal leaders (Dr. Laura) are 1.0 across the board. External
    leaders score 0.85 on a domain they explicitly cover and 0.65
    elsewhere. No leader → defensive default.
    """
    if is_internal is None:
        return SOURCE_AUTHORITY_NO_LEADER
    if is_internal:
        return SOURCE_AUTHORITY_INTERNAL
    if not entry_domains:
        return SOURCE_AUTHORITY_OUT_DOMAIN
    auth = set(authority_domains or [])
    return (
        SOURCE_AUTHORITY_IN_DOMAIN
        if any(d in auth for d in entry_domains)
        else SOURCE_AUTHORITY_OUT_DOMAIN
    )


def compute_corroboration(count: int) -> float:
    return min(count / CORROBORATION_DIVISOR, 1.0)


def compute_recency(created_at: datetime, now: datetime) -> float:
    if created_at is None:
        return 0.0
    delta_seconds = (now - created_at).total_seconds()
    years_old = delta_seconds / (365.25 * 24 * 3600)
    return max(0.0, 1.0 - (years_old / RECENCY_HALFLIFE_YEARS))


def compute_review_bonus(review_status: str | None) -> float:
    return REVIEW_BONUS.get(review_status or "", REVIEW_BONUS_DEFAULT)


def composite(authority: float, corroboration: float, recency: float, review: float) -> float:
    raw = (
        authority * W_AUTHORITY
        + corroboration * W_CORROBORATION
        + recency * W_RECENCY
        + review * W_REVIEW
    )
    # Round to 2 decimals to match clinical_knowledge.confidence_score NUMERIC(3,2).
    return round(max(0.0, min(1.0, raw)), 2)


# --- DB helpers -----------------------------------------------------------

def fetch_tenants(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tenants ORDER BY id")
        return [str(r[0]) for r in cur.fetchall()]


def compute_corroboration_counts(conn: psycopg.Connection) -> dict[str, int]:
    """Single SQL self-join: for each entry, count other entries within
    the same tenant that share at least one domain AND exceed the cosine
    similarity threshold. Tenant filtering happens via RLS on
    clinical_knowledge — caller must have set app.current_tenant_id.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT r1.id, COUNT(*) AS n
              FROM clinical_knowledge r1
              JOIN clinical_knowledge r2
                ON r1.id <> r2.id
               AND r1.tenant_id = r2.tenant_id
               AND r1.domains && r2.domains
               AND (1 - (r1.embedding <=> r2.embedding)) >= %s
             WHERE r1.embedding IS NOT NULL
               AND r2.embedding IS NOT NULL
             GROUP BY r1.id
            """,
            (CORROBORATION_SIMILARITY,),
        )
        return {str(rid): n for (rid, n) in cur.fetchall()}


def fetch_rows_with_leader(conn: psycopg.Connection) -> list[tuple]:
    """Pull every entry along with its joined leader's authority data."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ck.id,
                   ck.created_at,
                   ck.review_status,
                   ck.domains,
                   l.is_internal,
                   l.authority_domains
              FROM clinical_knowledge ck
         LEFT JOIN knowledge_leaders l ON l.id = ck.leader_id
             ORDER BY ck.id
            """
        )
        return cur.fetchall()


def flush_batch(
    conn: psycopg.Connection,
    updates: list[tuple[str, float, int]],
) -> int:
    """Apply (id, confidence_score, corroboration_count) updates."""
    if not updates:
        return 0
    n = 0
    with conn.cursor() as cur:
        for rid, score, count in updates:
            cur.execute(
                """
                UPDATE clinical_knowledge
                   SET confidence_score = %s,
                       corroboration_count = %s
                 WHERE id = %s
                """,
                (score, count, rid),
            )
            n += cur.rowcount
    conn.commit()
    return n


# --- Main -----------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="Compute and report the distribution but do not write back.")
    ap.add_argument("--limit", type=int, default=0,
                    help="Cap rows processed per tenant (0 = all).")
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2

    now = datetime.now(timezone.utc)

    conn = psycopg.connect(db_url, autocommit=False)
    start = time.time()
    grand_total = 0
    grand_buckets = {"very_low": 0, "low": 0, "medium": 0, "high": 0}
    grand_score_sum = 0.0
    try:
        tenants = fetch_tenants(conn)
        print(f"[confidence] tenants discovered: {len(tenants)}", flush=True)

        for tenant_id in tenants:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT set_config('app.current_tenant_id', %s, false)",
                    (tenant_id,),
                )
            conn.commit()

            print(
                f"[confidence] tenant {tenant_id}: "
                f"computing corroboration self-join...",
                flush=True,
            )
            t0 = time.time()
            corro = compute_corroboration_counts(conn)
            print(
                f"[confidence] corroboration computed in "
                f"{time.time() - t0:.1f}s ({len(corro)} rows have ≥1 corroborator "
                f"at sim≥{CORROBORATION_SIMILARITY})",
                flush=True,
            )

            rows = fetch_rows_with_leader(conn)
            if args.limit:
                rows = rows[: args.limit]
            print(
                f"[confidence] tenant {tenant_id}: scoring {len(rows)} entries",
                flush=True,
            )

            updates: list[tuple[str, float, int]] = []
            buckets = {"very_low": 0, "low": 0, "medium": 0, "high": 0}
            score_sum = 0.0
            for (rid, created_at, review_status,
                 entry_domains, is_internal, authority_domains) in rows:
                rid_s = str(rid)
                count = corro.get(rid_s, 0)
                authority = compute_source_authority(
                    is_internal, authority_domains, entry_domains or [],
                )
                corroboration = compute_corroboration(count)
                recency = compute_recency(created_at, now)
                review = compute_review_bonus(review_status)
                score = composite(authority, corroboration, recency, review)

                updates.append((rid_s, score, count))
                score_sum += score
                if score < 0.40:
                    buckets["very_low"] += 1
                elif score < 0.60:
                    buckets["low"] += 1
                elif score < 0.80:
                    buckets["medium"] += 1
                else:
                    buckets["high"] += 1

                if len(updates) >= BATCH_SIZE:
                    if not args.dry_run:
                        flush_batch(conn, updates)
                    updates = []

            if updates:
                if not args.dry_run:
                    flush_batch(conn, updates)
                updates = []

            print(
                f"[confidence] tenant {tenant_id} buckets: "
                f"very_low={buckets['very_low']} low={buckets['low']} "
                f"medium={buckets['medium']} high={buckets['high']} "
                f"avg={score_sum / max(len(rows), 1):.3f}",
                flush=True,
            )
            for k in grand_buckets:
                grand_buckets[k] += buckets[k]
            grand_total += len(rows)
            grand_score_sum += score_sum
    finally:
        conn.close()

    print()
    print(f"[confidence] DONE in {time.time() - start:.1f}s")
    print(f"[confidence]   total entries scored: {grand_total}"
          f"{' (dry-run, 0 written)' if args.dry_run else ''}")
    print(f"[confidence]   distribution:")
    print(f"     very_low (<0.40)         {grand_buckets['very_low']}")
    print(f"     low      (0.40 — 0.60)   {grand_buckets['low']}")
    print(f"     medium   (0.60 — 0.80)   {grand_buckets['medium']}")
    print(f"     high     (≥0.80)         {grand_buckets['high']}")
    if grand_total:
        print(f"[confidence]   avg score: {grand_score_sum / grand_total:.3f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
