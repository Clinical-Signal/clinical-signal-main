# Handoff prompt for Claude Code — Build `ingest_pdf.py` for Dr. Laura's Certification Materials

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Build a PDF → knowledge-entry ingestion script

This is P0.3 from `docs/MVP-PRIORITIZATION-2026-05-08.md` rev 7 and a requirement for the Issue #203 MVP gate. Three Dr. Laura Certification Materials PDFs are already staged at `~/clinical-signal-main/database/seed/dr-laura-drive/certification-materials/`. The existing ingestion pipeline (`load_knowledge.py`) consumes JSONL where each line is one knowledge entry. We need a new script that takes a PDF, extracts text, chunks it, and produces JSONL in the same shape.

**Read first:**
- `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md` — operational context
- `services/analysis-engine/scripts/ingest_knowledge.py` — the existing Slack-style ingestion script. Match its output JSONL shape.
- `services/analysis-engine/scripts/load_knowledge.py` — the consumer side. Look at how it parses JSONL and what fields it expects.
- `services/analysis-engine/app/knowledge/db.py` — the `insert_knowledge_item` function. This is the source of truth for what fields a knowledge entry must have.

## Implementation

### 1. New script: `services/analysis-engine/scripts/ingest_pdf.py`

```python
"""Extract knowledge entries from a PDF source file.

Usage:
    python scripts/ingest_pdf.py path/to/source.pdf \\
        --leader-slug dr-laura \\
        --source-channel certification-materials \\
        --source-title "Module 1: Systems-Biology Approach to Hormones" \\
        --output path/to/output.jsonl

Produces JSONL where each line is a knowledge entry the existing
load_knowledge.py can consume. The next step after this script is:
    python scripts/load_knowledge.py path/to/output.jsonl
"""
```

### 2. Text extraction

**Verified May 12: `poppler-utils` is already installed in `infrastructure/docker/Dockerfile.engine` line 15. PyMuPDF wheels also available per line 10.** Both `pdftotext` and `pypdf` work; pick one.

Recommended: `pdftotext` with `-layout` for slide-deck-style PDFs, `pypdf` as a fallback for unusual files.

```python
import subprocess

def extract_text(pdf_path: Path) -> str:
    """Extract plain text from a digital PDF using pdftotext.

    pdftotext flags:
      -layout: preserves columns and visual layout (better for slide decks)
      -nopgbrk: don't insert form-feed page breaks (we add our own)
    """
    result = subprocess.run(
        ["pdftotext", "-layout", "-nopgbrk", str(pdf_path), "-"],
        capture_output=True, text=True, check=True,
    )
    return result.stdout
```

For page-aware extraction (useful for the `page_range` metadata field), use pypdf:
```python
from pypdf import PdfReader
pages = [(i+1, page.extract_text()) for i, page in enumerate(PdfReader(pdf_path).pages)]
```

The Certification Materials PDFs are digital (not scans) so no OCR is needed. If you ever ingest a scanned PDF, you'd need to add Tesseract or similar — out of scope for v1.

### 3. Chunking strategy

PDF text needs to be chunked into knowledge-entry-sized pieces (~300-600 tokens each). Two approaches, try both and pick what works:

**Approach A — Heading-aware chunking (preferred for slides + structured docs):**
- Detect headings via heuristics: lines that are short (<100 chars), in title case or all caps, followed by content
- Each heading + the content beneath it (until the next heading or N tokens, whichever comes first) becomes one chunk
- Use the heading as the entry's `title`

**Approach B — Sliding-window paragraph chunking (fallback for unstructured text):**
- Split on double-newlines (paragraph boundaries)
- Pack paragraphs into ~300-token chunks
- Synthesize a title from the first sentence of each chunk

Try A first. If it produces too few chunks (e.g., one 50-page chapter becomes one giant chunk), fall back to B for that document.

### 4. Knowledge entry shape (verified May 12 from peptides-v2.jsonl)

The actual JSONL shape from current v2 files is richer than just title/content/category. Match it exactly:

```json
{
  "category": "interpretation_pattern",
  "title": "HPA Axis Negative Feedback Loop",
  "content": "...paragraph of curriculum content...",
  "conditions": [],
  "symptoms": [],
  "lab_markers": [],
  "supplements": [],
  "sequencing_notes": "",
  "contraindications": [],
  "clinical_reasoning": "",
  "systems_involved": [],
  "confidence_score": 0.5,
  "_extraction": {
    "model_id": "pdf_extractor_v1",
    "prompt_version": "pdf_extraction_v1",
    "lens": "interpretation_pattern"
  },
  "_source": {
    "channel": "certification-materials",
    "thread_hash": "<sha256-12char>",
    "thread_ts": "",
    "file": "Module_2_The_HPA_Axis_and_Stress_Resilience.pdf",
    "message_count": 1,
    "source_title": "Module 2: The HPA Axis and Stress Resilience",
    "section": "Endocrine System Overview",
    "page_range": "12-14"
  }
}
```

For PDF-extracted content most of the structured arrays (conditions/symptoms/lab_markers/supplements/sequencing_notes/contraindications/clinical_reasoning/systems_involved) will be empty — that's fine, they're optional. **The required fields are**: `category`, `title`, `content`, `_extraction`, `_source`. The post-ingest finalize hook (autotag domains, recompute confidence) will fill in domains and final confidence_score regardless of what's in the JSONL.

If you want to populate some of those structured fields heuristically (e.g., regex for supplement names mentioned in the text), that's a nice-to-have but not required for v1. Keep this script focused on extraction + chunking + JSONL output; let the existing pipeline do the heavy lifting from there.

### 5. Category assignment for PDF content

**Verified May 12 — actual category distribution in current corpus:**

| Category | Count in v2 corpus |
|---|---|
| `conditional_reasoning` | 701 |
| `case_based_qa` | 358 |
| `interpretation_pattern` | 201 |
| `clinical_feedback` | 80 |
| `resource_recommendation` | 65 |

(zero usage of v1 categories in current v2 JSONLs — pure v2 lens corpus)

For PDF curriculum content, use a simple LLM call to classify each chunk into one of these 5 categories. Reuse the domain-classification pattern from `autotag_domains.py`:

- Pass each chunk through the classifier
- Each call is small (~300 tokens in + ~10 tokens out) — costs are negligible (~$0.001 per chunk)
- Expected per Module 2 (probably 60-100 chunks): $0.06-0.10 in classification cost

Simpler heuristic fallback if LLM classification feels heavyweight: default to `interpretation_pattern` for slide content (closest match to "curriculum teaching how to interpret things"). Tune later once we see what kinds of content the PDFs actually produce.

Recommend the LLM-classification path — small cost, much better fidelity. Mirror `autotag_domains.py` exactly: load a one-shot prompt from `services/analysis-engine/prompts/pdf_categorization_v1.md`, send chunk content + heading, get back one of the 5 category strings, validate against the allow-list, default to `interpretation_pattern` if classification fails.

### 6. CLI

```python
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("pdf_path", help="Path to source PDF")
parser.add_argument("--leader-slug", default="dr-laura", help="leader slug for provenance")
parser.add_argument("--source-channel", required=True, help="e.g., certification-materials or fellowship-module-1")
parser.add_argument("--source-title", required=True, help="Human-readable source title")
parser.add_argument("--output", required=True, help="Output JSONL path")
parser.add_argument("--max-tokens-per-chunk", type=int, default=400)
parser.add_argument("--dry-run", action="store_true", help="Extract + chunk but don't write JSONL")
args = parser.parse_args()
```

## Hard constraints

- **Match the existing JSONL shape exactly.** Run the JSONL through `load_knowledge.py` afterward and verify entries land in `clinical_knowledge` correctly. If shape mismatches, `load_knowledge.py` will fail or skip rows silently.
- **Don't ingest into the DB directly from this script.** Stop at JSONL. The two-step pipeline (extract→JSONL, then JSONL→DB via load_knowledge.py) is intentional — preserves the existing observability and idempotency.
- **PDF text extraction should preserve paragraph boundaries.** Slides often have bullets; preserve them as separate paragraphs.
- **Chunk titles must be meaningful.** A chunk titled "Slide 14" is useless; "HPA Axis Negative Feedback Loop" is useful. Use detected headings; if none available, synthesize from first sentence.
- **Idempotent.** `source_chunk_hash` is `sha256(content)` — running twice on the same PDF produces same hashes, so `load_knowledge.py`'s dedup mechanism prevents duplicates.
- **No PHI.** Curriculum content is non-PHI. Standard handling.
- **Branch:** `feat/ingest-pdf`. Draft PR. Don't merge.

## Verification

1. `pdftotext` (or pypdf) installed: `docker compose exec analysis-engine which pdftotext` or `pip show pypdf`

2. Run on Module 2 (the largest, 3.6MB, HPA Axis):
   ```
   docker compose exec -T analysis-engine python scripts/ingest_pdf.py \
     database/seed/dr-laura-drive/certification-materials/Module_2_The_HPA_Axis_and_Stress_Resilience.pdf \
     --leader-slug dr-laura \
     --source-channel certification-materials \
     --source-title "Module 2: The HPA Axis and Stress Resilience" \
     --output /tmp/module-2-hpa.jsonl
   ```

3. Inspect the output:
   ```
   wc -l /tmp/module-2-hpa.jsonl  # expect 20-100 chunks depending on chunking
   head -3 /tmp/module-2-hpa.jsonl | jq .
   ```
   Each entry should have title, content, category, source_channel, source_chunk_hash, metadata. Spot-check that titles are meaningful (not "Slide 14").

4. Load into DB and watch the finalize chain:
   ```
   docker compose exec -T analysis-engine python scripts/load_knowledge.py /tmp/module-2-hpa.jsonl
   ```
   Expected log lines: `[load] done inserted=N`, `[finalize/autotag]`, `[finalize/confidence]`, `[finalize/enqueue]`.

5. Verify in DB:
   ```sql
   SELECT COUNT(*), AVG(confidence_score), array_agg(DISTINCT unnest(domains))
     FROM clinical_knowledge
    WHERE source_channel = 'certification-materials';
   ```
   Expected: count = N, average confidence in a reasonable range (probably 0.55-0.70), domains include 'hormones' and 'nervous_system' for HPA content.

6. Spot-check 5 random entries' content. Should be coherent clinical paragraphs, not OCR garbage or table-row fragments.

## Deliverable

- New: `services/analysis-engine/scripts/ingest_pdf.py`
- Optional new: `services/analysis-engine/prompts/pdf_categorization_v1.md` if you go LLM-classification route
- Possible update: `Dockerfile.engine` to add `poppler-utils` if `pdftotext` not already installed
- Draft PR titled "feat: ingest_pdf.py — extract knowledge entries from PDF source files"
- PR body should include:
  - Output of running it on Module 2 (chunk count, sample entries)
  - Output of load_knowledge.py on the resulting JSONL (insert count, finalize chain log)
  - SQL verification showing entries landed correctly
  - Notes on any choices (heading detection heuristic, category assignment strategy, dependency added)

Report the PR URL + chunk counts when done.
```

Once Claude Code's done with the bulk Slack load and starts on this, we have the full Dr. Laura content path operational by end of day. Paste the bulk-load results when they come back, then Claude Code can move straight to `ingest_pdf.py`.

[View prioritization rev 7](computer:///Users/herbew/clinical-signal-main/docs/MVP-PRIORITIZATION-2026-05-08.md) — Priority 0 section added, content exhaust framed as launch-blocking.

[View ingest_pdf.py handoff prompt](computer:///Users/herbew/clinical-signal-main/docs/CLAUDE-CODE-PROMPT-INGEST-PDF.md) — ready to paste when bulk load finishes.

Standing by for the bulk-load completion report.