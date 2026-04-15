import logging
import os
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel, Field

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

app = FastAPI(title="Clinical Signal Analysis Engine", version="0.2.0")


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="analysis-engine", version="0.2.0")


class ExtractRequest(BaseModel):
    record_id: str = Field(..., description="records.id row to update")
    tenant_id: str
    patient_id: str
    file_path: str = Field(..., description="Absolute path accessible to the engine")


class ExtractResponse(BaseModel):
    record_id: str
    accepted: bool


@app.post("/extract", response_model=ExtractResponse, status_code=202)
async def extract(req: ExtractRequest, tasks: BackgroundTasks) -> ExtractResponse:
    # Fail fast on obvious issues before scheduling work.
    p = Path(req.file_path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=400, detail=f"file not found: {req.file_path}")
    tasks.add_task(_run_pipeline, req.record_id, req.tenant_id, str(p))
    return ExtractResponse(record_id=req.record_id, accepted=True)


def _run_pipeline(record_id: str, tenant_id: str, file_path: str) -> None:
    phi_key = os.environ.get("PHI_ENCRYPTION_KEY")
    try:
        if not phi_key:
            raise RuntimeError("PHI_ENCRYPTION_KEY is not set")
        mark_processing(tenant_id, record_id)
        pdf = extract_pdf_text(file_path)
        if not pdf.text:
            raise RuntimeError("no text could be extracted from the PDF")
        structured, meta = extract_structured_labs(pdf.text)
        meta["pdf_pages"] = pdf.page_count
        meta["ocr_pages"] = pdf.ocr_pages
        mark_complete(tenant_id, record_id, pdf.text, structured, meta, phi_key)
        log.info("extracted record=%s pages=%d ocr=%d", record_id, pdf.page_count, pdf.ocr_pages)
    except Exception as err:
        # Never log raw extracted text — it may contain PHI. Only log the
        # error class / message.
        log.exception("extraction failed record=%s", record_id)
        try:
            mark_failed(tenant_id, record_id, f"{type(err).__name__}: {err}")
        except Exception:
            log.exception("could not mark record failed record=%s", record_id)


class AnalyzeRequest(BaseModel):
    tenant_id: str
    patient_id: str
    practitioner_id: str
    analysis_type: str = Field(default="full_history")


class AnalyzeResponse(BaseModel):
    analysis_id: str
    status: str


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Synchronous (30-60s). Gathers patient data, runs clinical analysis,
    stores a row in `analyses` with full provenance."""
    phi_key = os.environ.get("PHI_ENCRYPTION_KEY")
    if not phi_key:
        raise HTTPException(status_code=500, detail="PHI_ENCRYPTION_KEY is not set")

    try:
        timeline = gather_patient_timeline(req.tenant_id, req.patient_id)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err))

    analysis_id = insert_analysis_running(
        req.tenant_id,
        req.patient_id,
        req.practitioner_id,
        req.analysis_type,
        timeline.record_ids,
    )
    try:
        text = format_timeline_for_prompt(timeline)
        findings, meta, raw = run_clinical_analysis(text)
        complete_analysis(req.tenant_id, analysis_id, findings, meta, raw, phi_key)
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
            fail_analysis(req.tenant_id, analysis_id, f"{type(err).__name__}: {err}")
        except Exception:
            log.exception("could not mark analysis failed id=%s", analysis_id)
        raise HTTPException(status_code=500, detail=f"{type(err).__name__}: {err}")


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


def _build_kb_context(tenant_id: str, findings: dict, k: int) -> list[dict]:
    query = _kb_query_from_findings(findings)
    if not query:
        return []
    qvec = embed_one(query)
    return search_knowledge(tenant_id=tenant_id, query_embedding=qvec, k=k)


class GenerateProtocolRequest(BaseModel):
    tenant_id: str
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
async def generate_protocol(req: GenerateProtocolRequest) -> GenerateProtocolResponse:
    """Synchronous. Loads analysis findings, calls protocol_generation_v1,
    writes a draft protocol with both clinical_content and client_content."""
    analysis = get_analysis(req.tenant_id, req.analysis_id)
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
            kb_context = _build_kb_context(
                req.tenant_id, analysis["findings"], req.knowledge_k
            )
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
        req.tenant_id,
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


class KnowledgeSearchRequest(BaseModel):
    tenant_id: str
    query: str
    k: int = Field(default=5, ge=1, le=25)
    categories: list[str] | None = None


@app.post("/knowledge/search")
async def knowledge_search(req: KnowledgeSearchRequest) -> dict:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    qvec = embed_one(req.query)
    results = search_knowledge(
        tenant_id=req.tenant_id,
        query_embedding=qvec,
        k=req.k,
        categories=req.categories,
    )
    return {"query": req.query, "results": results}


class KnowledgeGraphRequest(BaseModel):
    tenant_id: str
    concept: str
    depth: int = Field(default=2, ge=1, le=3)


@app.post("/knowledge/graph")
async def knowledge_graph(req: KnowledgeGraphRequest) -> dict:
    if not req.concept.strip():
        raise HTTPException(status_code=400, detail="concept is required")
    return traverse_graph(
        tenant_id=req.tenant_id,
        start_name=req.concept.strip(),
        depth=req.depth,
    )
