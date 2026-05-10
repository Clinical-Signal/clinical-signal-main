"""DB helpers for clinical_knowledge + concepts/relationships tables."""
from __future__ import annotations

import json
from typing import Any

from app.pipeline.db import tenant_conn


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


def insert_knowledge_item(
    tenant_id: str,
    category: str,
    title: str,
    content: str,
    embedding: list[float],
    metadata: dict[str, Any],
    source_channel: str | None,
    source_chunk_hash: str | None,
    *,
    faithfulness_score: float | None = None,
    faithfulness_breakdown: dict[str, Any] | None = None,
    faithfulness_notes: str | None = None,
    review_status: str | None = None,
) -> str | None:
    """Inserts a row; returns id. Returns None if the (tenant, chunk_hash, title)
    triple already exists (idempotent ingestion).

    The faithfulness_* and review_status keyword args are written through
    when present (C.1.4 ingest pipeline). Older callers that don't pass
    them get NULL columns and the schema-default review_status, which
    keeps backward compat with pre-C.1.4 JSONL.
    """
    cat = category if category in VALID_CATEGORIES else "other"
    breakdown_json = (
        json.dumps(faithfulness_breakdown) if faithfulness_breakdown is not None else None
    )
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        # Use COALESCE on review_status so omitting it falls back to the
        # column default ('unreviewed') rather than overwriting with NULL.
        cur.execute(
            """
            INSERT INTO clinical_knowledge
                (tenant_id, category, title, content, embedding, metadata,
                 source_channel, source_chunk_hash,
                 faithfulness_score, faithfulness_breakdown,
                 faithfulness_notes, review_status)
            VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, %s, %s,
                    %s, %s::jsonb, %s, COALESCE(%s, 'unreviewed'))
            ON CONFLICT (tenant_id, source_chunk_hash, title) DO NOTHING
            RETURNING id
            """,
            (
                tenant_id,
                cat,
                title,
                content,
                _vector_literal(embedding),
                json.dumps(metadata),
                source_channel,
                source_chunk_hash,
                faithfulness_score,
                breakdown_json,
                faithfulness_notes,
                review_status,
            ),
        )
        row = cur.fetchone()
        return str(row[0]) if row else None


def search_knowledge(
    tenant_id: str,
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
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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
    tenant_id: str,
    concept_type: str,
    name: str,
    description: str | None,
    embedding: list[float] | None,
    metadata: dict,
) -> str:
    """Returns the id of the (possibly pre-existing) concept."""
    ctype = concept_type if concept_type in VALID_CONCEPT_TYPES else "other"
    emb_param = _vector_literal(embedding) if embedding else None
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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
                tenant_id,
                ctype,
                name.strip(),
                description,
                emb_param,
                json.dumps(metadata),
            ),
        )
        return str(cur.fetchone()[0])


def find_concept(
    tenant_id: str, name: str, concept_type: str | None = None
) -> dict | None:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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
    tenant_id: str,
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
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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
                tenant_id,
                source_id,
                target_id,
                relationship_type,
                strength,
                evidence,
                json.dumps(metadata),
            ),
        )
        return str(cur.fetchone()[0])


def traverse_graph(tenant_id: str, start_name: str, depth: int = 2) -> dict:
    """BFS up to `depth` hops. Returns {nodes: [...], edges: [...]}."""
    depth = max(1, min(3, depth))
    start = find_concept(tenant_id, start_name)
    if not start:
        return {"nodes": [], "edges": [], "query": start_name, "found": False}

    visited_ids: set[str] = {start["id"]}
    nodes: dict[str, dict] = {start["id"]: start}
    edges: list[dict] = []

    frontier = [start["id"]]
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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


def list_concepts(tenant_id: str, concept_type: str | None = None, limit: int = 200) -> list[dict]:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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
# Why 0.75 by default: with the post-C.1.3 dev distribution (range 0.68 —
# 0.98, mean 0.712, dominated by entries that floor out at 0.68 because
# they have zero corroboration at the 0.70 similarity threshold), 0.75
# flags roughly the bottom-half of the corpus. That's a lot for a first
# review session — and that's deliberate. We need *some* entries in the
# queue to validate the workflow end-to-end; setting the threshold tight
# (e.g. 0.65) catches near-zero rows on this corpus and we can't see if
# the queue UI even renders.
#
# Production tuning happens *after* Dr. Laura tells us her per-session
# review capacity. "I can do ~25 entries per 30 min" implies a different
# threshold than "100." Tune to the practitioner, not to the corpus.
LOW_CONFIDENCE_THRESHOLD = 0.75


def enqueue_review_items(
    conn,
    tenant_id: str,
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
            (tenant_id, threshold, tenant_id, threshold),
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
            (tenant_id, tenant_id),
        )
        counts["low_faithfulness"] = cur.rowcount

    conn.commit()
    return counts
