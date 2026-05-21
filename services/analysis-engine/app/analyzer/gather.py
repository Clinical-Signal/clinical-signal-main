"""Gather a patient's intake + structured records into a chronological
timeline that can be fed to the clinical-analysis prompt.

Runs inside a tenant-scoped connection so RLS enforces isolation.
PR4: takes TenantContext instead of tenant_id string.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app._core import TenantContext
from app.pipeline.db import tenant_conn


@dataclass
class PatientTimeline:
    patient_id: str
    intake_data: dict
    records: list[dict] = field(default_factory=list)
    record_ids: list[str] = field(default_factory=list)


def gather_patient_timeline(
    ctx: TenantContext, patient_id: str
) -> PatientTimeline:
    """Pulls intake_data + all structured records ordered by record_date.

    Raises LookupError if the patient does not exist (or RLS hides it).
    """
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT intake_data FROM patients WHERE id = %s",
            (patient_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise LookupError(
                f"patient {patient_id} not found in tenant {ctx.tenant_id}"
            )
        intake = row[0] or {}

        cur.execute(
            """
            SELECT id, record_type, record_date, structured_data, uploaded_at
              FROM records
             WHERE patient_id = %s
               AND processing_status = 'complete'
             ORDER BY COALESCE(record_date, uploaded_at::date) ASC,
                      uploaded_at ASC
            """,
            (patient_id,),
        )
        rows = cur.fetchall()

    records: list[dict] = []
    ids: list[str] = []
    for rid, rtype, rdate, sdata, uploaded in rows:
        ids.append(str(rid))
        records.append(
            {
                "record_id": str(rid),
                "record_type": rtype,
                "record_date": rdate.isoformat() if rdate else None,
                "uploaded_at": uploaded.isoformat() if uploaded else None,
                "structured_data": sdata or {},
            }
        )

    return PatientTimeline(
        patient_id=patient_id,
        intake_data=intake,
        records=records,
        record_ids=ids,
    )


def format_timeline_for_prompt(t: PatientTimeline) -> str:
    """Render the timeline as a compact, PHI-lean text block.

    Identifiers (name/DOB) are never loaded — they live in encrypted columns
    we do not read here. The intake_data JSONB may include free-text
    symptoms; that is acceptable content for the analysis.
    """
    import json

    sections: list[str] = []
    sections.append("## Intake")
    sections.append(json.dumps(t.intake_data, indent=2, default=str))

    if not t.records:
        sections.append("\n## Records\n(none — no completed structured records yet)")
    else:
        sections.append(f"\n## Records ({len(t.records)} complete)")
        for r in t.records:
            header = f"### {r['record_type']} — {r['record_date'] or 'undated'} (id {r['record_id']})"
            sections.append(header)
            sdata = dict(r["structured_data"] or {})
            sdata.pop("_extraction", None)
            sections.append(json.dumps(sdata, indent=2, default=str))

    return "\n".join(sections)
