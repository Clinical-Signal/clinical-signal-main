"""DB helpers for clinical_knowledge + concepts/relationships tables.

PR4: every public function that opens its own RLS-scoped connection
takes a TenantContext. Helper functions that receive an already-open
`conn` (e.g., enqueue_review_items, post_ingest_finalize) also take
TenantContext for API uniformity, even though they don't open the
connection themselves — the caller has already set
app.current_tenant_id on `conn` before calling.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app._core import TenantContext
from app.pipeline.db import tenant_conn

log = logging.getLogger(__name__)


# ---------- knowledge ----------

VALID_CATEGORIES = {
    "protocol_pattern",
    "supplement_protocol",
    "lab_interpretation",
    "clinical_sequencing",
    "dietary_recommendation",
    "lifestyle_intervention",
    # v2 extraction lenses
    "interpretation_pattern",
    "conditional_reasoning",
    "case_based_qa",
    "clinical_feedback",
    "resource_recommendation",
    "other",
}


def _vector_literal(vec: list[float]) -> str:
    """pgvector accepts a string like '[0.1,0.2,...]' when casting to vector."""
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


def _compute_item_content_hash(content: str) -> str:
    """Per-item content hash used as the dedup key for clinical_knowledge.

    Mirrors migration 0022's backfill: encode(sha256(content::bytea), 'hex').
    """
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def insert_knowledge_item(
    ctx: TenantContext,
    category: str,
    title: str,
    content: str,
    embedding: list[float],
    metadata: dict[str, Any],
    source_channel: str | None,
    source_chunk_hash: str | None,
    *,
    source_id: str | None = None,
    faithfulness_score: float | None = None,
    faithfulness_breakdown: dict[str, Any] | None = None,
    faithfulness_notes: str | None = None,
    review_status: str | None = None,
) -> str | None:
    """Inserts a row; returns id. Returns None if the (tenant, item_content_hash)
    pair already exists (idempotent ingestion per migration 0022).

    Dedup semantics: item_content_hash = sha256(content) is computed inside
    this function. Same content → same hash → ON CONFLICT DO NOTHING
    short-circuits. Multiple distinct items extracted from the same source
    chunk (each with its own content) all land as separate rows.
    source_chunk_hash is preserved as provenance metadata but no longer
    drives uniqueness.

    source_id is the knowledge_sources UUID for richer provenance and
    citation support (Phase 1 of the historical batch ingest). Callers
    after Phase 1 should always supply it; a warning is logged when None
    so we can spot orphan callers and backfill.

    The faithfulness_* and review_status keyword args are written through
    when present (C.1.4 ingest pipeline). Older callers that don't pass
    them get NULL columns and the schema-default review_status, which
    keeps backward compat with pre-C.1.4 JSONL.
    """
    cat = category if category in VALID_CATEGORIES else "other"
    item_content_hash = _compute_item_content_hash(content)
    breakdown_json = (
        json.dumps(faithfulness_breakdown) if faithfulness_breakdown is not None else None
    )
    if source_id is None:
        log.warning(
            "insert_knowledge_item called without source_id "
            "(tenant=%s, title=%r) — will land as orphan",
            ctx.tenant_id, title[:80],
        )
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        # Use COALESCE on review_status so omitting it falls back to the
        # column default ('unreviewed') rather than overwriting with NULL.
        cur.execute(
            """
            INSERT INTO clinical_knowledge
                (tenant_id, category, title, content, embedding, metadata,
                 source_channel, source_chunk_hash, item_content_hash,
                 source_id,
                 faithfulness_score, faithfulness_breakdown,
                 faithfulness_notes, review_status)
            VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, %s, %s, %s,
                    %s,
                    %s, %s::jsonb, %s, COALESCE(%s, 'unreviewed'))
            ON CONFLICT (tenant_id, item_content_hash) DO NOTHING
            RETURNING id
            """,
            (
                ctx.tenant_id,
                cat,
                title,
                content,
                _vector_literal(embedding),
                json.dumps(metadata),
                source_channel,
                source_chunk_hash,
                item_content_hash,
                source_id,
                faithfulness_score,
                breakdown_json,
                faithfulness_notes,
                review_status,
            ),
        )
        row = cur.fetchone()
        return str(row[0]) if row else None


# ---------- knowledge_sources (Phase 1c) ----------

ALLOWED_SOURCE_TYPES = frozenset({
    "book",
    "podcast_episode",
    "youtube_video",
    "article",
    "blog_post",
    "course_module",
    "training_recording",
    "clinical_case",
    "slack_thread",
    "research_paper",
    "protocol_template",
    "other",
})


def get_or_create_source(
    ctx: TenantContext,
    source_type: str,
    title: str,
    *,
    leader_id: str | None = None,
    url: str | None = None,
    file_path: str | None = None,
    raw_text_hash: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Get-or-create a knowledge_sources row, return its UUID.

    Idempotent on (tenant_id, raw_text_hash) when raw_text_hash is
    provided (the table's existing UNIQUE constraint from migration
    0016). When raw_text_hash is None, falls back to lookup by
    (tenant_id, source_type, title) before inserting; warns if that
    lookup matches multiple rows (the schema doesn't enforce uniqueness
    on the (type, title) pair, so it's possible but should be rare).

    source_type must be one of ALLOWED_SOURCE_TYPES (mirrors the CHECK
    constraint in migration 0016 lines 41-45). Raises ValueError on
    invalid type.

    Sets ingestion_status='ingesting' on create; callers should call
    mark_source_extracted() after their ingest loop completes.
    """
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise ValueError(
            f"invalid source_type {source_type!r}; "
            f"must be one of {sorted(ALLOWED_SOURCE_TYPES)}"
        )

    metadata_json = json.dumps(metadata or {})

    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        # Path A — caller supplied a content hash; use the schema's
        # UNIQUE (tenant_id, raw_text_hash) for atomic upsert.
        if raw_text_hash:
            cur.execute(
                """
                INSERT INTO knowledge_sources
                    (tenant_id, leader_id, source_type, title, url,
                     file_path, raw_text_hash, ingestion_status, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ingesting', %s::jsonb)
                ON CONFLICT (tenant_id, raw_text_hash) DO NOTHING
                RETURNING id
                """,
                (
                    ctx.tenant_id, leader_id, source_type, title, url,
                    file_path, raw_text_hash, metadata_json,
                ),
            )
            row = cur.fetchone()
            if row:
                return str(row[0])
            # Hit the conflict — fetch the existing row's id.
            cur.execute(
                "SELECT id FROM knowledge_sources "
                "WHERE tenant_id = %s AND raw_text_hash = %s",
                (ctx.tenant_id, raw_text_hash),
            )
            existing = cur.fetchone()
            if existing:
                return str(existing[0])
            # Shouldn't happen — the conflict means a row exists.
            raise RuntimeError(
                f"get_or_create_source: ON CONFLICT fired but no row found "
                f"for tenant={ctx.tenant_id} raw_text_hash={raw_text_hash[:16]}…"
            )

        # Path B — no content hash. Look up by (type, title) before
        # inserting. Schema has no UNIQUE on that pair, so a re-run with
        # the same args creates a second row — log a warning when the
        # lookup matches multiple existing rows so the inconsistency
        # surfaces.
        cur.execute(
            "SELECT id FROM knowledge_sources "
            "WHERE tenant_id = %s AND source_type = %s AND title = %s",
            (ctx.tenant_id, source_type, title),
        )
        rows = cur.fetchall()
        if len(rows) > 1:
            log.warning(
                "get_or_create_source: %d existing rows match "
                "(tenant=%s, source_type=%s, title=%r); returning first",
                len(rows), ctx.tenant_id, source_type, title[:80],
            )
        if rows:
            return str(rows[0][0])
        cur.execute(
            """
            INSERT INTO knowledge_sources
                (tenant_id, leader_id, source_type, title, url,
                 file_path, ingestion_status, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, 'ingesting', %s::jsonb)
            RETURNING id
            """,
            (
                ctx.tenant_id, leader_id, source_type, title, url,
                file_path, metadata_json,
            ),
        )
        return str(cur.fetchone()[0])


def mark_source_extracted(
    ctx: TenantContext, source_id: str, entry_count: int,
) -> None:
    """Mark a knowledge_sources row as extracted and record the entry count."""
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE knowledge_sources
               SET ingestion_status = 'extracted',
                   ingested_at = now(),
                   entry_count = %s
             WHERE id = %s AND tenant_id = %s
            """,
            (entry_count, source_id, ctx.tenant_id),
        )


def search_knowledge(
    ctx: TenantContext,
    query_embedding: list[float],
    k: int = 5,
    categories: list[str] | None = None,
) -> list[dict]:
    """Cosine-similarity top-K over clinical_knowledge."""
    qvec = _vector_literal(query_embedding)
    if categories:
        sql = """
            SELECT id, category, title, content, metadata, source_channel,
                   1 - (embedding <=> %s::vector) AS similarity
              FROM clinical_knowledge
             WHERE embedding IS NOT NULL AND category = ANY(%s)
             ORDER BY embedding <=> %s::vector
             LIMIT %s
        """
        params = [qvec, categories, qvec, k]
    else:
        sql = """
            SELECT id, category, title, content, metadata, source_channel,
                   1 - (embedding <=> %s::vector) AS similarity
              FROM clinical_knowledge
             WHERE embedding IS NOT NULL
             ORDER BY embedding <=> %s::vector
             LIMIT %s
        """
        params = [qvec, qvec, k]
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [
        {
            "id": str(r[0]),
            "category": r[1],
            "title": r[2],
            "content": r[3],
            "metadata": r[4] or {},
            "source_channel": r[5],
            "similarity": float(r[6]) if r[6] is not None else None,
        }
        for r in rows
    ]


# ---------- concepts ----------

VALID_CONCEPT_TYPES = {
    "symptom",
    "condition",
    "lab_marker",
    "supplement",
    "intervention",
    "body_system",
    "dietary_pattern",
    "other",
}


def upsert_concept(
    ctx: TenantContext,
    concept_type: str,
    name: str,
    description: str | None,
    embedding: list[float] | None,
    metadata: dict,
) -> str:
    """Returns the id of the (possibly pre-existing) concept."""
    ctype = concept_type if concept_type in VALID_CONCEPT_TYPES else "other"
    emb_param = _vector_literal(embedding) if embedding else None
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO clinical_concepts
                (tenant_id, concept_type, name, description, embedding, metadata)
            VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb)
            ON CONFLICT (tenant_id, concept_type, name)
              DO UPDATE SET
                description = COALESCE(EXCLUDED.description, clinical_concepts.description),
                metadata    = clinical_concepts.metadata || EXCLUDED.metadata
            RETURNING id
            """,
            (
                ctx.tenant_id,
                ctype,
                name.strip(),
                description,
                emb_param,
                json.dumps(metadata),
            ),
        )
        return str(cur.fetchone()[0])


def find_concept(
    ctx: TenantContext, name: str, concept_type: str | None = None
) -> dict | None:
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        if concept_type:
            cur.execute(
                """
                SELECT id, concept_type, name, description
                  FROM clinical_concepts
                 WHERE lower(name) = lower(%s) AND concept_type = %s
                 LIMIT 1
                """,
                (name, concept_type),
            )
        else:
            cur.execute(
                """
                SELECT id, concept_type, name, description
                  FROM clinical_concepts
                 WHERE lower(name) = lower(%s)
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
                (name,),
            )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": str(row[0]),
            "concept_type": row[1],
            "name": row[2],
            "description": row[3],
        }


# ---------- relationships ----------

VALID_RELATIONSHIPS = {
    "causes",
    "indicates",
    "treats",
    "precedes",
    "contraindicates",
    "part_of",
    "correlates_with",
    "worsens",
    "improves",
    "requires",
}


def insert_relationship(
    ctx: TenantContext,
    source_id: str,
    target_id: str,
    relationship_type: str,
    strength: float | None,
    evidence: str | None,
    metadata: dict,
) -> str | None:
    if source_id == target_id:
        return None
    if relationship_type not in VALID_RELATIONSHIPS:
        return None
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO clinical_relationships
                (tenant_id, source_concept_id, target_concept_id,
                 relationship_type, strength, evidence, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (tenant_id, source_concept_id, target_concept_id, relationship_type)
              DO UPDATE SET
                strength = COALESCE(EXCLUDED.strength, clinical_relationships.strength),
                evidence = COALESCE(EXCLUDED.evidence, clinical_relationships.evidence),
                metadata = clinical_relationships.metadata || EXCLUDED.metadata
            RETURNING id
            """,
            (
                ctx.tenant_id,
                source_id,
                target_id,
                relationship_type,
                strength,
                evidence,
                json.dumps(metadata),
            ),
        )
        return str(cur.fetchone()[0])


def traverse_graph(ctx: TenantContext, start_name: str, depth: int = 2) -> dict:
    """BFS up to `depth` hops. Returns {nodes: [...], edges: [...]}."""
    depth = max(1, min(3, depth))
    start = find_concept(ctx, start_name)
    if not start:
        return {"nodes": [], "edges": [], "query": start_name, "found": False}

    visited_ids: set[str] = {start["id"]}
    nodes: dict[str, dict] = {start["id"]: start}
    edges: list[dict] = []

    frontier = [start["id"]]
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        for _hop in range(depth):
            if not frontier:
                break
            cur.execute(
                """
                SELECT r.id, r.source_concept_id, r.target_concept_id,
                       r.relationship_type, r.strength, r.evidence,
                       sc.concept_type, sc.name, sc.description,
                       tc.concept_type, tc.name, tc.description
                  FROM clinical_relationships r
                  JOIN clinical_concepts sc ON sc.id = r.source_concept_id
                  JOIN clinical_concepts tc ON tc.id = r.target_concept_id
                 WHERE r.source_concept_id = ANY(%s)
                    OR r.target_concept_id = ANY(%s)
                """,
                (frontier, frontier),
            )
            rows = cur.fetchall()
            next_frontier: list[str] = []
            for r in rows:
                edges.append(
                    {
                        "id": str(r[0]),
                        "source_id": str(r[1]),
                        "target_id": str(r[2]),
                        "relationship_type": r[3],
                        "strength": float(r[4]) if r[4] is not None else None,
                        "evidence": r[5],
                    }
                )
                for nid, ctype, name, desc in (
                    (str(r[1]), r[6], r[7], r[8]),
                    (str(r[2]), r[9], r[10], r[11]),
                ):
                    if nid not in nodes:
                        nodes[nid] = {
                            "id": nid,
                            "concept_type": ctype,
                            "name": name,
                            "description": desc,
                        }
                    if nid not in visited_ids:
                        visited_ids.add(nid)
                        next_frontier.append(nid)
            frontier = next_frontier

    return {
        "query": start_name,
        "found": True,
        "depth": depth,
        "nodes": list(nodes.values()),
        "edges": edges,
    }


def list_concepts(
    ctx: TenantContext, concept_type: str | None = None, limit: int = 200
) -> list[dict]:
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        if concept_type:
            cur.execute(
                """
                SELECT id, concept_type, name, description
                  FROM clinical_concepts
                 WHERE concept_type = %s
                 ORDER BY name
                 LIMIT %s
                """,
                (concept_type, limit),
            )
        else:
            cur.execute(
                """
                SELECT id, concept_type, name, description
                  FROM clinical_concepts
                 ORDER BY concept_type, name
                 LIMIT %s
                """,
                (limit,),
            )
        rows = cur.fetchall()
    return [
        {"id": str(r[0]), "concept_type": r[1], "name": r[2], "description": r[3]}
        for r in rows
    ]


# ---------- review queue (C.1.5) ----------

# Composite-confidence threshold for the auto-flag pass. Anything strictly
# below this gets enqueued as 'low_confidence'.
#
# Calibrated to the current dev-DB state where 633 entries collapse to a
# single floor (~0.68) due to absent breadth in source_authority +
# review_bonus variance. 0.51 catches only entries that haven't been
# confidence-recomputed (e.g., the post-C.1.3 donna ingestion). Will
# become inert once the post-load recompute hook lands (filed as
# follow-up). Once external leader content creates real distribution
# variance, threshold should move back up to 0.75 to catch genuine
# outliers.
LOW_CONFIDENCE_THRESHOLD = 0.51


def enqueue_review_items(
    conn,
    ctx: TenantContext,
    threshold: float = LOW_CONFIDENCE_THRESHOLD,
) -> dict[str, int]:
    """Populate knowledge_review_queue from clinical_knowledge.

    Two flag conditions, run as separate INSERT ... SELECT statements:

      1. low_confidence  — composite confidence_score below ``threshold``.
      2. low_faithfulness — review_status='pending_review' (set by the
         C.1.4 ingestion pass when faithfulness landed in 0.50 — 0.75).

    Idempotent: each insert's NOT EXISTS subquery skips entries that are
    already queued for the same review_type with status pending or
    in_review, so re-running this function (post-load hook + standalone
    sweep) never creates duplicate rows. Resolved/skipped queue rows in
    history don't block re-queueing if a later recompute drops the entry
    back below threshold.

    The schema's queue table uses ``entry_ids UUID[]`` (designed for
    multi-entry review briefs); we insert single-element arrays per flag
    to fit the per-entry semantics here. A future smart-batching pass
    could fold related single-entry briefs into multi-entry briefs.

    Caller must have set app.current_tenant_id on ``conn`` before calling
    so RLS lets the SELECT/INSERT see the tenant's rows.

    Returns ``{'low_confidence': N, 'low_faithfulness': M}`` — the number
    of new queue rows inserted in this call (excludes skipped duplicates).
    """
    counts: dict[str, int] = {}

    with conn.cursor() as cur:
        # 1. Low composite confidence
        cur.execute(
            """
            INSERT INTO knowledge_review_queue (
                tenant_id, review_type, entry_ids, brief_title, status, notes
            )
            SELECT
                %s,
                'low_confidence',
                ARRAY[ck.id],
                'Low composite confidence: ' || left(ck.title, 140),
                'pending',
                'Composite confidence ' || ck.confidence_score::text
                  || ' below threshold ' || %s::text
            FROM clinical_knowledge ck
            WHERE ck.tenant_id = %s
              AND ck.confidence_score IS NOT NULL
              AND ck.confidence_score < %s
              AND NOT EXISTS (
                SELECT 1 FROM knowledge_review_queue q
                WHERE q.tenant_id = ck.tenant_id
                  AND q.review_type = 'low_confidence'
                  AND ck.id = ANY(q.entry_ids)
                  AND q.status IN ('pending', 'in_review')
              )
            RETURNING id
            """,
            (ctx.tenant_id, threshold, ctx.tenant_id, threshold),
        )
        counts["low_confidence"] = cur.rowcount

        # 2. Borderline faithfulness — review_status was flipped by the
        #    C.1.4 ingest pass for entries that landed in the 0.50 — 0.75
        #    faithfulness band. Faithfulness notes get rolled into the
        #    queue row's notes field so the reviewer doesn't have to
        #    cross-reference the original record.
        cur.execute(
            """
            INSERT INTO knowledge_review_queue (
                tenant_id, review_type, entry_ids, brief_title, status, notes
            )
            SELECT
                %s,
                'low_faithfulness',
                ARRAY[ck.id],
                'Borderline faithfulness: ' || left(ck.title, 140),
                'pending',
                'Faithfulness ' || COALESCE(ck.faithfulness_score::text, 'NULL')
                  || ' (' || COALESCE(ck.faithfulness_notes, 'no notes') || ')'
            FROM clinical_knowledge ck
            WHERE ck.tenant_id = %s
              AND ck.review_status = 'pending_review'
              AND NOT EXISTS (
                SELECT 1 FROM knowledge_review_queue q
                WHERE q.tenant_id = ck.tenant_id
                  AND q.review_type = 'low_faithfulness'
                  AND ck.id = ANY(q.entry_ids)
                  AND q.status IN ('pending', 'in_review')
              )
            RETURNING id
            """,
            (ctx.tenant_id, ctx.tenant_id),
        )
        counts["low_faithfulness"] = cur.rowcount

    conn.commit()
    return counts


# ---------- C.2-prep: unified post-ingest finalize ----------

def post_ingest_finalize(
    conn,
    ctx: TenantContext,
    *,
    threshold: float | None = None,
) -> dict:
    """Run the standard post-ingestion sequence for a tenant.

    Order matters and is enforced here:

      1. Autotag domains on any new entries (rows with domains = '{}').
      2. Recompute composite confidence_score for the entire tenant.
         A new entry can change corroboration counts for existing entries
         on the same topic, so this must be a tenant-wide recompute, not
         a delta on the new rows alone.
      3. Enqueue low-confidence and low-faithfulness entries into
         knowledge_review_queue. The NOT EXISTS pattern from C.1.5 dedups
         against already-queued items.

    Idempotent end-to-end: a second invocation on an unchanged tenant
    reports all-zero counts (no untagged rows, no score changes since the
    formula is deterministic, no new queue rows since dedup catches them).

    The three operations commit independently (each currently commits in
    its own batched loop). Full transactional atomicity across all three
    would require refactoring the batch commits inside autotag and
    recompute; ordering is the strict invariant, and any mid-run failure
    is recoverable by re-running this function — idempotency makes
    re-runs safe.

    Args:
      conn: open psycopg connection. Each step sets RLS context as needed.
      ctx: typed TenantContext for the tenant being finalized.
      threshold: low_confidence threshold for step 3; defaults to
        LOW_CONFIDENCE_THRESHOLD.

    Returns:
      {"autotag": {...}, "confidence": {...}, "enqueue": {...}}
    """
    # Lazy import to keep db.py loadable in contexts that don't have the
    # engine root on sys.path (the scripts add it themselves at import
    # time; load_knowledge.py — the live caller — sets it before reaching
    # here). Also avoids any chance of circular import at module load.
    from scripts.autotag_domains import autotag_tenant
    from scripts.recompute_confidence import recompute_confidence_tenant

    print(
        f"[finalize] tenant {ctx.tenant_id}: starting "
        f"(autotag → confidence → enqueue)",
        flush=True,
    )

    # Step 1 — autotag any rows where domains = '{}'. autotag_tenant +
    # recompute_confidence_tenant still take tenant_id as a string at
    # the script API (they receive an already-open conn and only need
    # the tenant id for SQL params). The PR4 script sweep migrates
    # them to a ctx-based signature in this PR's later commits, but
    # the call here is forward-compatible — we pass ctx.tenant_id.
    autotag_result = autotag_tenant(
        conn, ctx.tenant_id, log_prefix="[finalize/autotag]",
    )

    # Step 2 — tenant-wide confidence recompute. Order matters: must come
    # after autotag because the corroboration self-join is gated on
    # `r1.domains && r2.domains` and would skip newly-loaded rows whose
    # domain tags haven't been written yet.
    confidence_result = recompute_confidence_tenant(
        conn, ctx.tenant_id, log_prefix="[finalize/confidence]",
    )

    # Step 3 — enqueue review items. Reads the freshly-written
    # confidence_score and review_status from steps 1+2.
    enqueue_result = enqueue_review_items(
        conn, ctx, threshold or LOW_CONFIDENCE_THRESHOLD,
    )
    print(
        f"[finalize/enqueue] tenant {ctx.tenant_id}: "
        f"low_confidence={enqueue_result['low_confidence']} "
        f"low_faithfulness={enqueue_result['low_faithfulness']}",
        flush=True,
    )

    print(f"[finalize] tenant {ctx.tenant_id}: done", flush=True)
    return {
        "autotag": autotag_result,
        "confidence": confidence_result,
        "enqueue": enqueue_result,
    }
