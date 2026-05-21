"""Load extracted knowledge JSONL into clinical_knowledge with local embeddings.

Usage (inside analysis-engine container):
    python scripts/load_knowledge.py \
        --input /knowledge_out/protocols.jsonl \
        --tenant 00000000-0000-0000-0000-000000000001
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import os  # noqa: E402

import psycopg  # noqa: E402

from app._core import TenantContext, set_tenant_guc  # noqa: E402
from app.knowledge.db import (  # noqa: E402
    get_or_create_source,
    insert_knowledge_item,
    mark_source_extracted,
    post_ingest_finalize,
)
from app.knowledge.embeddings import embed  # noqa: E402


def _ctx_for_script(tenant_id: str, job_id: str) -> TenantContext:
    """Scripts run as system jobs — no practitioner identity. PR5's JWT
    flow doesn't apply here (these are operator-run batch tools)."""
    return TenantContext(
        tenant_id=tenant_id,
        practitioner_id=None,
        role="system",
        job_id=job_id,
        lifecycle_status="active",
    )


def _finalize_for_tenant(ctx: TenantContext) -> dict | None:
    """Open a tenant-scoped connection and run the C.2-prep finalize step.

    Replaces the standalone C.1.5 enqueue hook with the unified
    autotag → recompute → enqueue sequence.

    Wrapped in try/except because a failure here should NOT roll back the
    successful insert phase — the finalize step is recoverable by
    re-running scripts/autotag_domains.py, scripts/recompute_confidence.py,
    and scripts/enqueue_review.py individually (or just re-loading, which
    triggers the hook again with idempotent NOT EXISTS / WHERE-clause
    guards on all three operations).
    """
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return None
    try:
        with psycopg.connect(db_url, autocommit=False) as conn:
            set_tenant_guc(conn, ctx)
            return post_ingest_finalize(conn, ctx)
    except Exception as err:
        print(
            f"[load] WARN: post-load finalize failed: "
            f"{type(err).__name__}: {err}",
            file=sys.stderr,
            flush=True,
        )
        return None


def _embed_text(item: dict) -> str:
    """What we embed. Prefer full content + key structured fields so searches
    like 'HPA axis' can hit items whose title doesn't say that explicitly."""
    parts = [item.get("title", ""), item.get("content", "")]
    reasoning = item.get("clinical_reasoning")
    if reasoning:
        parts.append(reasoning)
    seq = item.get("sequencing_notes")
    if seq:
        parts.append(seq)
    for key in ("conditions", "symptoms"):
        vals = item.get(key) or []
        if vals:
            parts.append(", ".join(str(v) for v in vals))
    return "\n".join(p for p in parts if p).strip()


def _resolve_per_file_source(
    ctx: TenantContext,
    items: list[dict],
    jsonl_path: Path,
    leader_id: str | None,
    source_type: str,
) -> str | None:
    """Create a knowledge_sources row for the JSONL file as a whole.

    Returns the source_id, or None if every item in the file already
    embeds its own ``_source.source_id`` (in which case the PDF or
    custom ingest already created per-source rows and we'd just be
    minting an orphan slack_thread row otherwise).

    Channel name comes from the first item's ``_source.channel``;
    raw_text_hash is sha256 of the whole JSONL bytes for idempotency
    across re-loads.
    """
    if items and all((it.get("_source") or {}).get("source_id") for it in items):
        return None

    raw_text_hash = hashlib.sha256(jsonl_path.read_bytes()).hexdigest()
    first_src = (items[0].get("_source") if items else None) or {}
    channel = first_src.get("channel") or jsonl_path.stem

    return get_or_create_source(
        ctx,
        source_type,
        title=channel,
        leader_id=leader_id,
        file_path=str(jsonl_path),
        raw_text_hash=raw_text_hash,
        metadata={"jsonl_filename": jsonl_path.name, "entry_count": len(items)},
    )


def _resolve_leader_id(ctx: TenantContext, leader_slug: str | None) -> str | None:
    """Look up a leader UUID by slug. Returns None if slug is None or
    not found (we log and continue rather than block — leader_id is
    nullable on knowledge_sources)."""
    if not leader_slug:
        return None
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return None
    with psycopg.connect(db_url) as conn:
        set_tenant_guc(conn, ctx)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM knowledge_leaders "
                "WHERE tenant_id = %s AND slug = %s",
                (ctx.tenant_id, leader_slug),
            )
            row = cur.fetchone()
            if not row:
                print(
                    f"[load] WARN: no knowledge_leaders row found for "
                    f"slug={leader_slug!r} — source rows will have leader_id NULL",
                    file=sys.stderr, flush=True,
                )
                return None
            return str(row[0])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True)
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--batch", type=int, default=32, help="embedding batch size")
    ap.add_argument(
        "--leader-slug",
        default="dr-laura",
        help="Leader slug recorded on the per-file knowledge_sources row "
             "(default: dr-laura). Ignored when every entry already embeds "
             "_source.source_id from an upstream ingest script.",
    )
    ap.add_argument(
        "--source-type",
        default="slack_thread",
        help="source_type for the per-file knowledge_sources row "
             "(default: slack_thread). Set to course_module / book / etc. "
             "when loading non-Slack JSONLs that don't carry their own "
             "source_id.",
    )
    args = ap.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(f"input not found: {path}", file=sys.stderr)
        return 2

    items: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    print(f"[load] items={len(items)}", flush=True)

    if not items:
        return 0

    ctx = _ctx_for_script(args.tenant, job_id=f"load_knowledge:{path.name}")

    # Per-file knowledge_sources row (skipped when every entry already
    # has its own source_id from upstream — e.g. ingest_pdf.py which
    # creates one course_module source per PDF).
    leader_id = _resolve_leader_id(ctx, args.leader_slug)
    per_file_source_id = _resolve_per_file_source(
        ctx, items, path, leader_id, args.source_type,
    )
    if per_file_source_id:
        print(
            f"[load] per-file source: id={per_file_source_id} "
            f"type={args.source_type}",
            flush=True,
        )
    else:
        print("[load] per-file source: skipped (entries carry own source_id)",
              flush=True)

    # Batch-embed the text we intend to search against.
    texts = [_embed_text(it) for it in items]
    vectors: list[list[float]] = []
    t0 = time.time()
    for i in range(0, len(texts), args.batch):
        batch = texts[i : i + args.batch]
        vectors.extend(embed(batch))
        print(
            f"[load] embedded {len(vectors)}/{len(texts)} "
            f"elapsed={time.time() - t0:.1f}s",
            flush=True,
        )

    inserted = 0
    skipped = 0
    per_file_used = 0
    for item, vec in zip(items, vectors):
        src = item.get("_source") or {}
        # Per-entry source_id wins (PDF path). Fall back to per-file.
        source_id = src.get("source_id") or per_file_source_id
        if source_id == per_file_source_id and per_file_source_id is not None:
            per_file_used += 1
        metadata = {
            "conditions": item.get("conditions") or [],
            "symptoms": item.get("symptoms") or [],
            "lab_markers": item.get("lab_markers") or [],
            "supplements": item.get("supplements") or [],
            "sequencing_notes": item.get("sequencing_notes"),
            "contraindications": item.get("contraindications") or [],
            "clinical_reasoning": item.get("clinical_reasoning"),
            "extraction": item.get("_extraction") or {},
        }
        rid = insert_knowledge_item(
            ctx,
            category=item.get("category") or "other",
            title=(item.get("title") or "")[:200] or "(untitled)",
            content=item.get("content") or "",
            embedding=vec,
            metadata=metadata,
            source_channel=src.get("channel"),
            source_chunk_hash=src.get("chunk_hash"),
            source_id=source_id,
            # C.1.4 fields — present when the JSONL came from a faithfulness-
            # enabled ingest run; absent (None) for older JSONL.
            faithfulness_score=item.get("faithfulness_score"),
            faithfulness_breakdown=item.get("faithfulness_breakdown"),
            faithfulness_notes=item.get("faithfulness_notes"),
            review_status=item.get("review_status"),
        )
        if rid:
            inserted += 1
        else:
            skipped += 1

    # Mark the per-file source as extracted with the count of entries
    # that actually used it (excludes PDF entries that referenced their
    # own source_id).
    if per_file_source_id is not None:
        mark_source_extracted(ctx, per_file_source_id, per_file_used)

    print(f"[load] done inserted={inserted} skipped_duplicates={skipped}")

    # C.2-prep post-load hook: autotag domains → recompute confidence →
    # enqueue review queue items. Each step is idempotent and non-fatal;
    # ordering inside the helper is enforced (recompute must come after
    # autotag because the corroboration self-join is domain-gated).
    result = _finalize_for_tenant(ctx)
    if result is not None:
        a = result["autotag"]
        c = result["confidence"]
        e = result["enqueue"]
        print(
            f"[load] finalize: "
            f"autotag(processed={a['processed']} channel={a['channel_mapped']} "
            f"llm={a['llm_classified']} failed={a['failed']}) "
            f"confidence(total={c['total']} avg="
            f"{(c['score_sum'] / max(c['total'], 1)):.3f}) "
            f"enqueue(low_confidence={e['low_confidence']} "
            f"low_faithfulness={e['low_faithfulness']})"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
