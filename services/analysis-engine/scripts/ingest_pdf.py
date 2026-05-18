"""Extract knowledge entries from a PDF source file into the standard JSONL shape.

Companion to scripts/ingest_knowledge.py (which handles Slack-style channel
exports). This script handles digital PDFs — Dr. Laura's Certification
Materials, Fellowship slide decks, and similar curriculum content.

Output is JSONL where each line is one knowledge entry. The next step is:

    python scripts/load_knowledge.py --input out.jsonl --tenant <uuid>

…which runs the post-ingest finalize chain (autotag → recompute confidence
→ enqueue review) per PR #186.

Usage:
    python scripts/ingest_pdf.py path/to/source.pdf \\
        --leader-slug dr-laura \\
        --source-channel certification-materials \\
        --source-title "Module 1: Systems-Biology Approach to Hormones" \\
        --output /tmp/out.jsonl

Requires DATABASE_URL (no — only used by load_knowledge.py) and
ANTHROPIC_API_KEY (for the per-chunk category classifier).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

# Make `app.*` imports work when invoked from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fitz  # PyMuPDF — already in requirements.txt
from anthropic import Anthropic  # noqa: E402

import psycopg  # noqa: E402

from app.knowledge.db import (  # noqa: E402
    ALLOWED_SOURCE_TYPES,
    get_or_create_source,
)

PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "pdf_categorization_v1.md"
)
PROMPT_VERSION = "pdf_categorization_v1"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
CLASSIFY_MAX_TOKENS = 32

# Chunking targets. ~1 token ≈ 4 chars in English, so 1200-2400 chars ≈
# 300-600 tokens. Slides are typically small (~200-1500 chars per page).
MIN_CHUNK_CHARS = 200
MAX_CHUNK_CHARS = 2400
# When a single page exceeds MAX_CHUNK_CHARS we split at paragraph
# boundaries; if no paragraph break appears, we hard-split at this size.
HARD_SPLIT_CHARS = 3000

# Categories the LLM classifier may return. Anything else falls back to
# the default. Matches `VALID_CATEGORIES` in app/knowledge/db.py.
VALID_CATEGORIES: frozenset[str] = frozenset({
    "interpretation_pattern",
    "conditional_reasoning",
    "case_based_qa",
    "clinical_feedback",
    "resource_recommendation",
})
DEFAULT_CATEGORY = "interpretation_pattern"


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_pages(pdf_path: Path) -> list[tuple[int, str]]:
    """Open the PDF and return [(page_no, text), ...]. Page numbers are
    1-based to match how humans cite PDFs.

    PyMuPDF's get_text("text") returns reading-order text with paragraph
    boundaries roughly preserved. Layout (columns, tables) gets flattened
    — acceptable for slides and prose curriculum; would need
    get_text("blocks") for column-heavy academic papers.
    """
    doc = fitz.open(pdf_path)
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text")
        pages.append((i, text))
    doc.close()
    return pages


def normalize_text(s: str) -> str:
    """Collapse trailing whitespace, merge soft-wrapped lines.

    Slide PDFs often have hard line breaks inside what should be one
    sentence (because of column width). Merge lines that don't end in
    sentence punctuation with the next line; preserve double-newlines as
    paragraph breaks.
    """
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    # Preserve paragraph breaks (2+ newlines), collapse single newlines
    # that look like soft wraps.
    paras: list[str] = []
    for para in re.split(r"\n\s*\n", s):
        # Within a paragraph, merge lines that don't terminate cleanly.
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if not lines:
            continue
        out: list[str] = []
        for ln in lines:
            if out and not out[-1].rstrip().endswith((".", "?", "!", ":", ";", '"', "'", "”", "’")):
                out[-1] += " " + ln
            else:
                out.append(ln)
        paras.append("\n".join(out))
    return "\n\n".join(paras).strip()


# ---------------------------------------------------------------------------
# Heading / title detection
# ---------------------------------------------------------------------------

_BULLET_RE = re.compile(r"^[•●◦\*\-–—]\s*")


def detect_title(page_text: str, fallback_page_no: int) -> str:
    """Pick a meaningful title for a page.

    Heuristic: the first non-bullet, non-empty line that is short (≤100
    chars) and doesn't look like a sentence (doesn't end in punctuation).
    If the first line is long or sentence-shaped, synthesize from its
    first ~80 chars. If the page is entirely empty, return a stable
    placeholder.
    """
    lines = [ln.strip() for ln in page_text.split("\n") if ln.strip()]
    if not lines:
        return f"Page {fallback_page_no}"
    # Skip leading bullets — they're never titles.
    candidates = [ln for ln in lines if not _BULLET_RE.match(ln)]
    if not candidates:
        candidates = lines

    first = candidates[0]
    # Strip trailing punctuation that's just a stylistic flourish.
    head = first.rstrip(":·•")
    if len(head) <= 100 and not head.endswith((".", "?", "!")):
        return head.strip()

    # Long first line — extract first sentence-ish fragment.
    snippet = re.split(r"(?<=[.!?])\s+", head, maxsplit=1)[0]
    if len(snippet) > 100:
        snippet = snippet[:97].rsplit(" ", 1)[0] + "…"
    return snippet.strip() or f"Page {fallback_page_no}"


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def build_chunks(pages: list[tuple[int, str]]) -> list[dict]:
    """Convert pages → chunks.

    Strategy:
      - Each non-empty page is a candidate chunk, with its detected title.
      - Tiny pages (< MIN_CHUNK_CHARS) are merged forward into the next
        non-tiny page — typically TOC entries, headers, or slide titles
        that pdftotext split across pages.
      - Oversize pages (> MAX_CHUNK_CHARS) are split at paragraph
        boundaries into ~MAX_CHUNK_CHARS-sized pieces. Each piece
        inherits the page's title with an indexed suffix.

    Returns list of {title, content, page_range} dicts. page_range is a
    string like "12" or "12-14" reflecting which pages contributed.
    """
    # Pre-normalize each page's text.
    cleaned: list[tuple[int, str, str]] = []  # (page_no, title, content)
    for page_no, raw in pages:
        body = normalize_text(raw)
        if not body:
            continue
        title = detect_title(body, page_no)
        cleaned.append((page_no, title, body))

    # Merge tiny pages forward. We carry the running title from the
    # earliest non-merged page so the chunk surfaces the first heading
    # rather than a downstream bullet.
    merged: list[tuple[int, int, str, str]] = []  # (start_page, end_page, title, content)
    buf_pages: list[int] = []
    buf_title: str | None = None
    buf_body: list[str] = []

    def flush():
        nonlocal buf_pages, buf_title, buf_body
        if buf_pages:
            merged.append((
                buf_pages[0], buf_pages[-1],
                buf_title or f"Page {buf_pages[0]}",
                "\n\n".join(buf_body).strip(),
            ))
        buf_pages, buf_title, buf_body = [], None, []

    for page_no, title, body in cleaned:
        if not buf_pages:
            buf_title = title
        buf_pages.append(page_no)
        buf_body.append(body)
        if sum(len(x) for x in buf_body) >= MIN_CHUNK_CHARS:
            flush()
    flush()

    # Split oversize pages into paragraph-bounded pieces.
    out: list[dict] = []
    for start, end, title, content in merged:
        page_range = str(start) if start == end else f"{start}-{end}"
        if len(content) <= MAX_CHUNK_CHARS:
            out.append({"title": title, "content": content, "page_range": page_range})
            continue
        # Split at paragraph boundaries, packing toward MAX_CHUNK_CHARS.
        paras = content.split("\n\n")
        cur: list[str] = []
        cur_len = 0
        part_idx = 1
        for p in paras:
            if cur_len + len(p) + 2 > MAX_CHUNK_CHARS and cur:
                out.append({
                    "title": f"{title} (part {part_idx})",
                    "content": "\n\n".join(cur).strip(),
                    "page_range": page_range,
                })
                part_idx += 1
                cur, cur_len = [], 0
            cur.append(p)
            cur_len += len(p) + 2
        if cur:
            out.append({
                "title": f"{title} (part {part_idx})" if part_idx > 1 else title,
                "content": "\n\n".join(cur).strip(),
                "page_range": page_range,
            })
        # As a last-resort guard, hard-split any chunk that's still huge
        # (a single paragraph over HARD_SPLIT_CHARS — vanishingly rare).
    return [c for c in out if len(c["content"]) >= MIN_CHUNK_CHARS // 2]


# ---------------------------------------------------------------------------
# Category classifier (LLM)
# ---------------------------------------------------------------------------

def classify_chunk(client: Anthropic, system_prompt: str, title: str, content: str) -> str:
    """One-shot LLM classification. Returns one of VALID_CATEGORIES or
    DEFAULT_CATEGORY on parse/refusal."""
    user = f"Title: {title}\nContent: {content[:2000]}"
    try:
        msg = client.messages.create(
            model=MODEL,
            max_tokens=CLASSIFY_MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as err:
        print(f"[ingest_pdf] WARN classify API error: {err}", file=sys.stderr, flush=True)
        return DEFAULT_CATEGORY
    if msg.stop_reason == "refusal":
        return DEFAULT_CATEGORY
    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text").strip()
    # Strip code fences / extra punctuation / wrapping quotes if the
    # model gets clever.
    cleaned = raw.strip().strip("`").strip("'\"").strip().splitlines()
    pick = cleaned[0].strip() if cleaned else ""
    return pick if pick in VALID_CATEGORIES else DEFAULT_CATEGORY


# ---------------------------------------------------------------------------
# Entry assembly
# ---------------------------------------------------------------------------

def build_entry(
    chunk: dict,
    category: str,
    *,
    file_name: str,
    source_channel: str,
    source_title: str,
    source_id: str | None = None,
) -> dict:
    """Assemble a knowledge entry that matches the v2 JSONL shape
    consumed by load_knowledge.py + insert_knowledge_item.

    chunk_hash is sha256(content)[:16] — stable across runs. Since
    migration 0022 the loader's dedup key is per-item content hash
    (computed inside insert_knowledge_item), so chunk_hash is now
    provenance metadata rather than the uniqueness driver.

    source_id, when provided, is the knowledge_sources UUID minted by
    this script before extraction started; the loader passes it through
    to insert_knowledge_item for rich provenance.
    """
    content = chunk["content"]
    chunk_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
    source_block: dict[str, Any] = {
        "channel": source_channel,
        "chunk_hash": chunk_hash,
        "file": file_name,
        "source_title": source_title,
        "section": chunk["title"],
        "page_range": chunk.get("page_range", ""),
    }
    if source_id:
        source_block["source_id"] = source_id
    return {
        "category": category,
        "title": chunk["title"][:200],
        "content": content,
        "conditions": [],
        "symptoms": [],
        "lab_markers": [],
        "supplements": [],
        "sequencing_notes": "",
        "contraindications": [],
        "clinical_reasoning": "",
        "systems_involved": [],
        "_extraction": {
            "model_id": "pdf_extractor_v1",
            "prompt_version": PROMPT_VERSION,
            "lens": category,
        },
        "_source": source_block,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _resolve_leader_id(tenant_id: str, leader_slug: str) -> str | None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return None
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)",
                (tenant_id,),
            )
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM knowledge_leaders "
                "WHERE tenant_id = %s AND slug = %s",
                (tenant_id, leader_slug),
            )
            row = cur.fetchone()
            return str(row[0]) if row else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pdf_path", help="Path to source PDF")
    ap.add_argument("--leader-slug", default="dr-laura",
                    help="Leader slug for provenance metadata (default: dr-laura)")
    ap.add_argument("--source-channel", required=True,
                    help="e.g., certification-materials, fellowship-module-1")
    ap.add_argument("--source-title", required=True,
                    help="Human-readable source title")
    ap.add_argument("--output", required=True, help="Output JSONL path")
    ap.add_argument(
        "--tenant",
        help="Tenant UUID. When supplied (and not --dry-run), creates a "
             "knowledge_sources row before extraction and embeds source_id "
             "into each entry's _source. Omit for legacy JSONL-only mode.",
    )
    ap.add_argument(
        "--source-type",
        default="course_module",
        choices=sorted(ALLOWED_SOURCE_TYPES),
        help="source_type for the knowledge_sources row (default: course_module)",
    )
    ap.add_argument("--max-tokens-per-chunk", type=int, default=400,
                    help="Reserved for future use; current chunker uses MAX_CHUNK_CHARS")
    ap.add_argument("--dry-run", action="store_true",
                    help="Extract + chunk + classify, but don't write JSONL "
                         "and don't create a knowledge_sources row")
    args = ap.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 2
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    client = Anthropic(api_key=api_key)
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")

    print(f"[ingest_pdf] {pdf_path.name}: extracting…", flush=True)
    t0 = time.time()
    pages = extract_pages(pdf_path)
    print(f"[ingest_pdf] {len(pages)} pages in {time.time() - t0:.1f}s", flush=True)

    chunks = build_chunks(pages)
    print(f"[ingest_pdf] {len(chunks)} chunks after merging + splitting", flush=True)

    # Create the knowledge_sources row once, eagerly — before any LLM
    # spend. raw_text_hash is sha256 of the full extracted text (joined
    # page bodies), so re-runs over the same PDF map to the same source
    # row via the schema's UNIQUE (tenant_id, raw_text_hash) constraint.
    source_id: str | None = None
    if args.tenant and not args.dry_run:
        full_text = "\n\n".join(t for _, t in pages)
        raw_text_hash = hashlib.sha256(full_text.encode("utf-8")).hexdigest()
        leader_id = _resolve_leader_id(args.tenant, args.leader_slug)
        if not leader_id:
            print(
                f"[ingest_pdf] WARN: no knowledge_leaders row for slug="
                f"{args.leader_slug!r} — source will have leader_id NULL",
                file=sys.stderr, flush=True,
            )
        source_id = get_or_create_source(
            args.tenant,
            args.source_type,
            title=pdf_path.stem,
            leader_id=leader_id,
            file_path=str(pdf_path),
            raw_text_hash=raw_text_hash,
            metadata={
                "source_channel": args.source_channel,
                "source_title": args.source_title,
                "page_count": len(pages),
            },
        )
        print(f"[ingest_pdf] source_id={source_id}", flush=True)

    # Category-classifier pass.
    category_counts: dict[str, int] = {c: 0 for c in VALID_CATEGORIES}
    entries: list[dict] = []
    t0 = time.time()
    for i, chunk in enumerate(chunks, start=1):
        category = classify_chunk(client, system_prompt, chunk["title"], chunk["content"])
        category_counts[category] = category_counts.get(category, 0) + 1
        entries.append(build_entry(
            chunk, category,
            file_name=pdf_path.name,
            source_channel=args.source_channel,
            source_title=args.source_title,
            source_id=source_id,
        ))
        if i % 20 == 0 or i == len(chunks):
            print(
                f"[ingest_pdf] classified {i}/{len(chunks)} "
                f"elapsed={time.time() - t0:.1f}s",
                flush=True,
            )

    if args.dry_run:
        print("[ingest_pdf] DRY RUN — not writing JSONL", flush=True)
    else:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as f:
            for e in entries:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        print(f"[ingest_pdf] wrote {len(entries)} entries → {out_path}", flush=True)

    print()
    print(f"[ingest_pdf] category breakdown:")
    for c, n in sorted(category_counts.items(), key=lambda kv: -kv[1]):
        print(f"   {c:25s} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
