"""DB writes for analyses + protocols. All writes go through a tenant-scoped
connection so RLS applies."""
from __future__ import annotations

import json

from app.pipeline.db import tenant_conn


def insert_analysis_running(
    tenant_id: str,
    patient_id: str,
    practitioner_id: str,
    analysis_type: str,
    input_record_ids: list[str],
) -> str:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO analyses (
                tenant_id, patient_id, practitioner_id, analysis_type,
                input_record_ids, status
            ) VALUES (%s, %s, %s, %s, %s, 'running')
            RETURNING id
            """,
            (tenant_id, patient_id, practitioner_id, analysis_type, input_record_ids),
        )
        return str(cur.fetchone()[0])


def complete_analysis(
    tenant_id: str,
    analysis_id: str,
    findings: dict,
    meta: dict,
    raw_response: str,
    phi_key: str,
) -> None:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE analyses
               SET findings = %s::jsonb,
                   raw_ai_response_encrypted = pgp_sym_encrypt(%s, %s),
                   model_id = %s,
                   prompt_version = %s,
                   token_usage = %s::jsonb,
                   status = 'complete',
                   completed_at = now()
             WHERE id = %s
            """,
            (
                json.dumps(findings),
                raw_response,
                phi_key,
                meta.get("model_id"),
                meta.get("prompt_version"),
                json.dumps(meta.get("token_usage", {})),
                analysis_id,
            ),
        )


def fail_analysis(tenant_id: str, analysis_id: str, error: str) -> None:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE analyses
               SET status = 'failed',
                   findings = jsonb_build_object('error', %s),
                   completed_at = now()
             WHERE id = %s
            """,
            (error[:2000], analysis_id),
        )


def get_analysis(tenant_id: str, analysis_id: str) -> dict | None:
    """Reads findings + patient_id + practitioner_id for protocol generation."""
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT patient_id, practitioner_id, findings, status
              FROM analyses
             WHERE id = %s
            """,
            (analysis_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "patient_id": str(row[0]),
            "practitioner_id": str(row[1]),
            "findings": row[2] or {},
            "status": row[3],
        }


def insert_protocol(
    tenant_id: str,
    patient_id: str,
    practitioner_id: str,
    analysis_id: str,
    title: str,
    clinical_content: dict,
    client_content: dict,
) -> str:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO protocols (
                tenant_id, patient_id, practitioner_id, analysis_id,
                title, clinical_content, client_content, status, version
            ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 'draft', 1)
            RETURNING id
            """,
            (
                tenant_id,
                patient_id,
                practitioner_id,
                analysis_id,
                title,
                json.dumps(clinical_content),
                json.dumps(client_content),
            ),
        )
        return str(cur.fetchone()[0])
