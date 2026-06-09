"""FastAPI entry point for the analysis engine.

PR5 closed the engine's network trust loophole: every PHI route now
requires a signed JWT via `Depends(require_engine_jwt)`, and the
request models no longer carry `tenant_id` (or `practitioner_id` —
those flow from the JWT claims). Routes that take a resource id in
the body cross-check it against `ctx.tenant_id` via
`verify_resource_in_tenant` to fast-fail 403 instead of leaning on
RLS to silently 404.

Health check (`/health`) is the only intentionally unauthenticated
route — it's used by docker-compose's healthcheck and AWS ALB target
groups.
"""
import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from app._core import (
    TenantContext,
    require_engine_jwt,
)
from app.exporter.db import (
    get_patient_name,
    get_protocol_for_export,
    insert_protocol_export_record,
)
from app.exporter.pdf import render_clinical_pdf, render_client_pdf
from app.analyzer.db import (
    complete_analysis,
    fail_analysis,
    get_analysis,
    insert_analysis_running,
    insert_protocol,
)
from app.analyzer.gather import format_timeline_for_prompt, gather_patient_timeline
from app.analyzer.llm import run_clinical_analysis, run_protocol_generation
from app.knowledge.db import search_knowledge, traverse_graph
from app.knowledge.embeddings import embed_one
from app.pipeline.db import mark_complete, mark_failed, mark_processing
from app.pipeline.llm import extract_structured_labs
from app.pipeline.pdf import extract_pdf_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("engine")

app = FastAPI(title="Clinical Signal Analysis Engine", version="0.3.0")

# Type alias for the dependency-injected TenantContext. Reads cleaner
# than the full `Annotated[..., Depends(...)]` at every call site.
EngineCtx = Annotated[TenantContext, Depends(require_engine_jwt)]


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Unauthenticated by design — used by container/load-balancer
    healthchecks. Returns no PHI or tenant data."""
    return HealthResponse(status="ok", service="analysis-engine", version="0.3.0")


# ---------------------------------------------------------------------------
# /extract — fire-and-forget background extraction of a lab PDF
# ---------------------------------------------------------------------------


class ExtractRequest(BaseModel):
    record_id: str = Field(..., description="records.id row to update")
    patient_id: str
    file_path: str = Field(..., description="Absolute path accessible to the engine")


class ExtractResponse(BaseModel):
    record_id: str
    accepted: bool


@app.post("/extract", response_model=ExtractResponse, status_code=202)
async def extract(
    req: ExtractRequest, tasks: BackgroundTasks, ctx: EngineCtx
) -> ExtractResponse:
    # Tenant scoping: the background task runs every DB write through
    # tenant_conn(ctx) which is RLS-scoped to ctx.tenant_id. A
    # request whose record_id / patient_id belongs to a different
    # tenant simply hits zero rows when mark_processing fires, and
    # the worker logs a clean failure. (See auth.py for why we don't
    # do an explicit 403 fast-fail here.)

    # Fail fast on obvious file issues before scheduling work.
    p = Path(req.file_path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=400, detail=f"file not found: {req.file_path}")
    tasks.add_task(_run_pipeline, req.record_id, ctx.tenant_id, str(p))
    return ExtractResponse(record_id=req.record_id, accepted=True)


def _run_pipeline(record_id: str, tenant_id: str, file_path: str) -> None:
    """Background task body. Rebuilds a TenantContext from the JWT-
    verified tenant_id passed in (the JWT-scoped ctx itself can't
    travel to a BackgroundTasks worker because Depends() is per-
    request). Marked as a system job since this runs after the HTTP
    response is already sent."""
    phi_key = os.environ.get("PHI_ENCRYPTION_KEY")
    bg_ctx = TenantContext(
        tenant_id=tenant_id,
        practitioner_id=None,
        role="system",
        job_id=f"extract:{record_id}",
        lifecycle_status="active",
    )
    try:
        if not phi_key:
            raise RuntimeError("PHI_ENCRYPTION_KEY is not set")
        mark_processing(bg_ctx, record_id)
        pdf = extract_pdf_text(file_path)
        if not pdf.text:
            raise RuntimeError("no text could be extracted from the PDF")
        structured, meta = extract_structured_labs(pdf.text)
        meta["pdf_pages"] = pdf.page_count
        meta["ocr_pages"] = pdf.ocr_pages
        mark_complete(bg_ctx, record_id, pdf.text, structured, meta, phi_key)
        log.info("extracted record=%s pages=%d ocr=%d", record_id, pdf.page_count, pdf.ocr_pages)
    except Exception as err:
        # Never log raw extracted text — it may contain PHI. Only log the
        # error class / message.
        log.exception("extraction failed record=%s", record_id)
        try:
            mark_failed(bg_ctx, record_id, f"{type(err).__name__}: {err}")
        except Exception:
            log.exception("could not mark record failed record=%s", record_id)


# ---------------------------------------------------------------------------
# /analyze — synchronous clinical analysis of a patient timeline
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    patient_id: str
    analysis_type: str = Field(default="full_history")


class AnalyzeResponse(BaseModel):
    analysis_id: str
    status: str


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, ctx: EngineCtx) -> AnalyzeResponse:
    """Synchronous (30-60s). Gathers patient data, runs clinical analysis,
    stores a row in `analyses` with full provenance.

    practitioner_id flows from the JWT (ctx.practitioner_id). For
    system-initiated analyses (no human practitioner attached at the
    web tier), the JWT carries practitioner_id=None and the analysis
    is recorded as system-initiated."""
    phi_key = os.environ.get("PHI_ENCRYPTION_KEY")
    if not phi_key:
        raise HTTPException(status_code=500, detail="PHI_ENCRYPTION_KEY is not set")
    if not ctx.practitioner_id:
        raise HTTPException(
            status_code=400,
            detail="analyze requires a practitioner-scoped JWT (pid claim)",
        )

    # gather_patient_timeline runs under tenant_conn(ctx) so a
    # patient_id that belongs to another tenant raises LookupError
    # below, which we surface as 404. RLS, not application code, is
    # the authoritative gate.

    try:
        timeline = gather_patient_timeline(ctx, req.patient_id)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err))

    analysis_id = insert_analysis_running(
        ctx,
        req.patient_id,
        ctx.practitioner_id,
        req.analysis_type,
        timeline.record_ids,
    )
    try:
        text = format_timeline_for_prompt(timeline)
        findings, meta, raw = run_clinical_analysis(text)
        complete_analysis(ctx, analysis_id, findings, meta, raw, phi_key)
        log.info(
            "analysis complete id=%s records=%d tokens_out=%s",
            analysis_id,
            len(timeline.record_ids),
            meta.get("token_usage", {}).get("output_tokens"),
        )
        return AnalyzeResponse(analysis_id=analysis_id, status="complete")
    except Exception as err:
        log.exception("analysis failed id=%s", analysis_id)
        try:
            fail_analysis(ctx, analysis_id, f"{type(err).__name__}: {err}")
        except Exception:
            log.exception("could not mark analysis failed id=%s", analysis_id)
        raise HTTPException(status_code=500, detail=f"{type(err).__name__}: {err}")


# ---------------------------------------------------------------------------
# /generate-protocol — synchronous protocol generation off an analysis
# ---------------------------------------------------------------------------


def _kb_query_from_findings(findings: dict) -> str:
    """Compose a dense retrieval query from the analysis findings.

    We concatenate the chief patterns, presenting symptoms, and key lab
    findings. These are the same signals Dr. Laura's mentorship corpus tends
    to organize around, so they embed well against that content.
    """
    parts: list[str] = []
    cp = findings.get("clinical_picture") or {}
    for p in cp.get("chief_patterns") or []:
        parts.append(str(p))
    for s in cp.get("presenting_symptoms") or []:
        parts.append(str(s))
    for sa in findings.get("systems_analysis") or []:
        if isinstance(sa, dict) and sa.get("system"):
            parts.append(str(sa["system"]))
    for lf in findings.get("key_lab_findings") or []:
        if isinstance(lf, dict):
            name = lf.get("test_name")
            val = lf.get("value")
            if name:
                parts.append(f"{name} {val or ''}".strip())
    return "\n".join(p for p in parts if p).strip()[:4000]


def _build_kb_context(ctx: TenantContext, findings: dict, k: int) -> list[dict]:
    query = _kb_query_from_findings(findings)
    if not query:
        return []
    qvec = embed_one(query)
    return search_knowledge(ctx, query_embedding=qvec, k=k)


class GenerateProtocolRequest(BaseModel):
    analysis_id: str
    # Optional override of the USE_KNOWLEDGE_BASE env flag. Lets us generate
    # both KB-enhanced and baseline protocols for comparison without
    # restarting the service.
    use_knowledge_base: bool | None = None
    knowledge_k: int = Field(default=6, ge=0, le=20)


class GenerateProtocolResponse(BaseModel):
    protocol_id: str
    analysis_id: str
    status: str


@app.post("/generate-protocol", response_model=GenerateProtocolResponse)
async def generate_protocol(
    req: GenerateProtocolRequest, ctx: EngineCtx
) -> GenerateProtocolResponse:
    """Synchronous. Loads analysis findings, calls protocol_generation_v1,
    writes a draft protocol with both clinical_content and client_content."""
    # RLS-scoped get_analysis returns None for cross-tenant ids; we
    # fall through to the not-found 404 below.

    analysis = get_analysis(ctx, req.analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="analysis not found")
    if analysis["status"] != "complete":
        raise HTTPException(
            status_code=400,
            detail=f"analysis status is {analysis['status']}, must be complete",
        )

    # Knowledge-base retrieval. Gated by env (default on) and request override.
    env_default = os.environ.get("USE_KNOWLEDGE_BASE", "1") not in ("0", "false", "")
    use_kb = env_default if req.use_knowledge_base is None else req.use_knowledge_base
    kb_context: list[dict] = []
    if use_kb and req.knowledge_k > 0:
        try:
            kb_context = _build_kb_context(ctx, analysis["findings"], req.knowledge_k)
            log.info(
                "kb_context analysis=%s items=%d",
                req.analysis_id,
                len(kb_context),
            )
        except Exception as err:
            # Non-fatal: fall back to no-KB generation but record that we
            # tried. Never block a protocol because KB retrieval failed.
            log.warning(
                "kb retrieval failed analysis=%s err=%s",
                req.analysis_id,
                err,
            )
            kb_context = []

    try:
        protocol, meta, _raw = run_protocol_generation(
            analysis["findings"], kb_context=kb_context
        )
    except Exception as err:
        log.exception("protocol generation failed analysis=%s", req.analysis_id)
        raise HTTPException(status_code=500, detail=f"{type(err).__name__}: {err}")

    title = protocol.get("title") or "Draft Protocol"
    clinical_content = protocol.get("clinical_protocol") or {}
    client_content = protocol.get("client_action_plan") or {}
    clinical_content.setdefault("_generation", {}).update(meta)
    if "meta" in protocol:
        clinical_content["_generation"]["model_meta"] = protocol["meta"]
    if kb_context:
        clinical_content["_generation"]["kb_sources"] = [
            {
                "id": it.get("id"),
                "title": it.get("title"),
                "category": it.get("category"),
                "source_channel": it.get("source_channel"),
                "similarity": it.get("similarity"),
            }
            for it in kb_context
        ]

    protocol_id = insert_protocol(
        ctx,
        analysis["patient_id"],
        analysis["practitioner_id"],
        req.analysis_id,
        title,
        clinical_content,
        client_content,
    )
    log.info(
        "protocol generated id=%s analysis=%s tokens_out=%s",
        protocol_id,
        req.analysis_id,
        meta.get("token_usage", {}).get("output_tokens"),
    )
    return GenerateProtocolResponse(
        protocol_id=protocol_id,
        analysis_id=req.analysis_id,
        status="draft",
    )


# ---------------------------------------------------------------------------
# /knowledge/search — per-tenant semantic search over clinical_knowledge
# ---------------------------------------------------------------------------


class KnowledgeSearchRequest(BaseModel):
    query: str
    k: int = Field(default=5, ge=1, le=25)
    categories: list[str] | None = None


@app.post("/knowledge/search")
async def knowledge_search(req: KnowledgeSearchRequest, ctx: EngineCtx) -> dict:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    qvec = embed_one(req.query)
    results = search_knowledge(
        ctx,
        query_embedding=qvec,
        k=req.k,
        categories=req.categories,
    )
    return {"query": req.query, "results": results}


# ---------------------------------------------------------------------------
# /knowledge/graph — bounded BFS over clinical_concepts/relationships
# ---------------------------------------------------------------------------


class KnowledgeGraphRequest(BaseModel):
    concept: str
    depth: int = Field(default=2, ge=1, le=3)


@app.post("/knowledge/graph")
async def knowledge_graph(req: KnowledgeGraphRequest, ctx: EngineCtx) -> dict:
    if not req.concept.strip():
        raise HTTPException(status_code=400, detail="concept is required")
    return traverse_graph(
        ctx,
        start_name=req.concept.strip(),
        depth=req.depth,
    )


# ---------------------------------------------------------------------------
# /export-protocol — render PDF and persist a records-row pointer
# ---------------------------------------------------------------------------


class ExportProtocolRequest(BaseModel):
    protocol_id: str
    audience: str = Field(..., description="'clinical' or 'client'")
    practice_name: str = "Clinical Signal"


@app.post("/export-protocol")
async def export_protocol(req: ExportProtocolRequest, ctx: EngineCtx) -> Response:
    """Renders a finalized-or-draft protocol to PDF and returns the bytes.

    Also writes a records row of type 'protocol_export' so the export shows
    up in the patient's records list and can be re-downloaded.
    """
    if req.audience not in ("clinical", "client"):
        raise HTTPException(status_code=400, detail="audience must be 'clinical' or 'client'")
    phi_key = os.environ.get("PHI_ENCRYPTION_KEY")
    if not phi_key:
        raise HTTPException(status_code=500, detail="PHI_ENCRYPTION_KEY is not set")

    # RLS-scoped get_protocol_for_export returns None for cross-tenant
    # ids; the 404 below catches both "truly missing" and "wrong tenant".

    proto = get_protocol_for_export(ctx, req.protocol_id)
    if not proto:
        raise HTTPException(status_code=404, detail="protocol not found")

    patient_name = get_patient_name(ctx, proto["patient_id"], phi_key)

    if req.audience == "clinical":
        pdf_bytes = render_clinical_pdf(
            practice_name=req.practice_name,
            patient_name=patient_name,
            protocol_title=proto["title"],
            clinical_content=proto["clinical_content"],
            generated_at=proto["created_at"],
        )
    else:
        pdf_bytes = render_client_pdf(
            practice_name=req.practice_name,
            patient_name=patient_name,
            protocol_title=proto["title"],
            client_content=proto["client_content"],
            generated_at=proto["created_at"],
        )

    # Persist the PDF to the uploads volume so the records row can point to
    # it and the web tier can serve it later. The same volume already backs
    # lab uploads.
    uploads_dir = Path(os.environ.get("UPLOADS_DIR", "/uploads"))
    rel_key = f"protocol_exports/{proto['id']}_{req.audience}_v{proto['version']}.pdf"
    fs_path = uploads_dir / rel_key
    fs_path.parent.mkdir(parents=True, exist_ok=True)
    fs_path.write_bytes(pdf_bytes)
    fs_path.chmod(0o600)

    try:
        insert_protocol_export_record(
            ctx,
            patient_id=proto["patient_id"],
            file_key=rel_key,
            audience=req.audience,
            protocol_id=proto["id"],
            protocol_version=proto["version"],
        )
    except Exception:
        # Don't fail the download if the bookkeeping insert fails — the file
        # is on disk and the response still ships. Log only.
        log.exception(
            "protocol_export records-row insert failed protocol=%s audience=%s",
            proto["id"], req.audience,
        )

    filename = f"{(proto['title'] or 'protocol').replace(' ', '_')}_{req.audience}_v{proto['version']}.pdf"
    log.info(
        "protocol exported id=%s audience=%s bytes=%d",
        proto["id"], req.audience, len(pdf_bytes),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
