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
) -> str | None:
    """Inserts a row; returns id. Returns None if the (tenant, chunk_hash, title)
    triple already exists (idempotent ingestion)."""
    cat = category if category in VALID_CATEGORIES else "other"
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO clinical_knowledge
                (tenant_id, category, title, content, embedding, metadata,
                 source_channel, source_chunk_hash)
            VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, %s, %s)
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
