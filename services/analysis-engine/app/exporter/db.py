"""DB helpers for the protocol exporter."""
from __future__ import annotations

import json

from app.pipeline.db import tenant_conn


def get_protocol_for_export(tenant_id: str, protocol_id: str) -> dict | None:
    """Returns title, content blobs, version, status, patient_id, created_at."""
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, patient_id, title, status, version,
                   clinical_content, client_content, created_at
              FROM protocols
             WHERE id = %s
            """,
            (protocol_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": str(row[0]),
            "patient_id": str(row[1]),
            "title": row[2],
            "status": row[3],
            "version": row[4],
            "clinical_content": row[5] or {},
            "client_content": row[6] or {},
            "created_at": row[7].isoformat() if row[7] else None,
        }


def get_patient_name(tenant_id: str, patient_id: str, phi_key: str) -> str | None:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT pgp_sym_decrypt(name_encrypted, %s)::text FROM patients WHERE id = %s",
            (phi_key, patient_id),
        )
        row = cur.fetchone()
        return row[0] if row else None


def insert_protocol_export_record(
    tenant_id: str,
    patient_id: str,
    file_key: str,
    audience: str,
    protocol_id: str,
    protocol_version: int,
) -> str:
    """Writes a records row of type protocol_export pointing at the saved PDF."""
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO records
                (tenant_id, patient_id, record_type, source_file_key,
                 structured_data, processing_status)
            VALUES (%s, %s, 'protocol_export', %s, %s::jsonb, 'complete')
            RETURNING id
            """,
            (
                tenant_id,
                patient_id,
                file_key,
                json.dumps(
                    {
                        "audience": audience,
                        "protocol_id": protocol_id,
                        "protocol_version": protocol_version,
                    }
                ),
            ),
        )
        return str(cur.fetchone()[0])
