# Handoff prompt for Claude Code — Build `ingest_canvas.py` for Slack canvases.json

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Build a Slack canvases.json → knowledge-entry ingestion script

This is **P0.5** from `docs/MVP-PRIORITIZATION-2026-05-08.md` and a requirement for Issue #203's MVP gate. Slack canvases are structured docs Dr. Laura's team pinned to channels — curated, higher signal-to-noise than channel messages. They're already structured JSON in the Slack export, so this is smaller in scope than `ingest_pdf.py`: no pdftotext, no chunking heuristics, no LLM categorization pass strictly required.

**Read first:**
- `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md` — operational context (canvases.json is 24KB, line 30 has the design intent)
- `services/analysis-engine/scripts/ingest_pdf.py` — the just-shipped sibling script. Match its CLI shape, JSONL output shape, and provenance fields.
- `services/analysis-engine/scripts/ingest_knowledge.py` — the original Slack-message ingestion script. Reuse the prompt-loading and faithfulness-check helpers if they fit.
- `services/analysis-engine/scripts/load_knowledge.py` — the consumer. The JSONL you emit must round-trip through this with no shape mismatches.

## Implementation

### 1. New script: `services/analysis-engine/scripts/ingest_canvas.py`

```python
"""Extract knowledge entries from a Slack canvases.json export file.

Usage:
    python scripts/ingest_canvas.py path/to/canvases.json \
        --leader-slug dr-laura \
        --output path/to/output.jsonl \
        [--filter-channel <channel_name>]  # optional, ingest only one channel's canvases

Produces JSONL where each line is a knowledge entry the existing
load_knowledge.py can consume. The next step after this script is:
    python scripts/load_knowledge.py path/to/output.jsonl
"""
```

### 2. Input shape — inspect the actual file first

The canvases.json file lives somewhere in the Slack export bundle Dr. Laura provided. Find it:

```bash
find ~/clinical-signal-main -iname "canvases*.json" 2>/dev/null
# If not in the repo yet, ask Ryan where the Slack export was unpacked.
```

Slack canvases JSON typically looks like an array of canvas objects, each with `id`, `title`, `channel_id`, `channel_name`, and a `content` field that's either rich-text blocks (an array of `{type, elements: [...]}`) or a plain markdown/text string. **Don't assume — print the top-level keys and a sample item before writing the parser:**

```python
import json
with open(path) as f:
    data = json.load(f)
print(type(data), len(data) if isinstance(data, (list, dict)) else "scalar")
print(json.dumps(data[0] if isinstance(data, list) else next(iter(data.values())), indent=2)[:2000])
```

Build the rich-text → plain-text flattener around what you actually observe. Slack rich-text elements commonly nest: a `rich_text` block contains `rich_text_section` elements, which contain `text` / `link` / `user` / `emoji` leaves. Walk recursively; concatenate `text` values; render `link` as `[text](url)`; drop emojis and user-mentions (or stringify them as `:emoji:` / `@user`).

### 3. Chunking

Most canvases are 1-5 paragraphs — well within a single knowledge entry. Default behavior: **one canvas → one knowledge entry.** Title from `canvas.title`, content from flattened body. Only split if a canvas exceeds ~800 tokens; then chunk on paragraph boundaries (`\n\n`), preserving the original title with a `(part N/M)` suffix.

### 4. Category assignment

Same path as `ingest_pdf.py`: LLM classification into one of the five v2 lens categories. Default to `interpretation_pattern` if classification fails. Reuse `services/analysis-engine/prompts/pdf_categorization_v1.md` if it exists; if it was scoped only to PDFs, generalize it to `content_categorization_v1.md` or write a thin `canvas_categorization_v1.md` sibling. Mention the choice in the PR body.

Canvases are short enough that an alternative is fine: hard-code `interpretation_pattern` and skip the LLM call — saves ~$0.05 total but loses fidelity on the ~5-10% of canvases that are actually `case_based_qa` or `resource_recommendation`. Recommend LLM classification; the cost is negligible.

### 5. Knowledge entry shape (must exactly match `ingest_pdf.py` output)

```json
{
  "category": "interpretation_pattern",
  "title": "<canvas.title>",
  "content": "<flattened plain text>",
  "conditions": [], "symptoms": [], "lab_markers": [], "supplements": [],
  "sequencing_notes": "", "contraindications": [], "clinical_reasoning": "",
  "systems_involved": [],
  "confidence_score": 0.5,
  "_extraction": {
    "model_id": "canvas_extractor_v1",
    "prompt_version": "canvas_extraction_v1",
    "lens": "<assigned-category>"
  },
  "_source": {
    "channel": "<canvas.channel_name>",
    "thread_hash": "<sha256-12char of content>",
    "thread_ts": "",
    "file": "canvases.json",
    "message_count": 1,
    "source_title": "<canvas.title>",
    "section": "",
    "page_range": ""
  }
}
```

### 6. CLI

```python
parser.add_argument("canvas_path", help="Path to Slack canvases.json")
parser.add_argument("--leader-slug", default="dr-laura")
parser.add_argument("--output", required=True)
parser.add_argument("--filter-channel", default=None,
                    help="Only ingest canvases from this channel_name")
parser.add_argument("--max-tokens-per-chunk", type=int, default=800)
parser.add_argument("--dry-run", action="store_true")
```

## Hard constraints

- **Match the JSONL shape exactly.** Run the output through `load_knowledge.py` and verify entries land in `clinical_knowledge`.
- **Stop at JSONL.** Two-step pipeline preserved.
- **Idempotent.** `thread_hash = sha256(content)[:12]` — re-running on the same canvases.json produces same hashes, dedup'd by `load_knowledge.py`.
- **Source attribution.** `channel = canvas.channel_name` (not "canvases"), so corpus aggregates by-channel still work. Sets a precedent for distinguishing canvas content from message content within the same channel; that's a follow-up if it becomes needed.
- **No PHI.** Standard handling.
- **Branch:** `feat/ingest-canvas`. Draft PR. Don't merge.

## Verification

1. Locate canvases.json. If missing from the repo, ask Ryan where to find it. Expected location once placed: `database/seed/dr-laura-slack/canvases.json` (create the dir if needed and add a `.gitkeep`).

2. Dry-run to confirm parsing:
   ```bash
   docker compose exec -T analysis-engine python scripts/ingest_canvas.py \
     database/seed/dr-laura-slack/canvases.json \
     --leader-slug dr-laura \
     --output /tmp/canvases.jsonl \
     --dry-run
   ```
   Expected: prints canvas count, sample title + first 200 chars of flattened content per canvas. No file written.

3. Real run:
   ```bash
   docker compose exec -T analysis-engine python scripts/ingest_canvas.py \
     database/seed/dr-laura-slack/canvases.json \
     --leader-slug dr-laura \
     --output /tmp/canvases.jsonl
   wc -l /tmp/canvases.jsonl
   head -3 /tmp/canvases.jsonl | jq '. | {category, title, content: (.content | .[:120])}'
   ```
   Expected: 15-50 entries (typical canvas count for an active workspace), titles match canvas titles, content is clean prose.

4. Load into DB:
   ```bash
   docker compose exec -T analysis-engine python scripts/load_knowledge.py /tmp/canvases.jsonl
   ```
   Expected finalize chain: `[load] done inserted=N`, `[finalize/autotag]`, `[finalize/confidence]`, `[finalize/enqueue]`.

5. Verify in DB:
   ```sql
   SELECT _source->>'file' AS source_file, COUNT(*), AVG(confidence_score)
     FROM clinical_knowledge
    WHERE _source->>'file' = 'canvases.json'
    GROUP BY 1;
   ```
   Plus a leader_id check — should all be Dr. Laura, no NULLs (Issue #187 should be permanently fixed by now, but verify).

6. Spot-check 3 random entries: content should be coherent paragraphs, not raw Slack JSON or mojibake.

## Deliverable

- New: `services/analysis-engine/scripts/ingest_canvas.py`
- Possible new: `services/analysis-engine/prompts/canvas_categorization_v1.md` (or generalized `content_categorization_v1.md`)
- New empty dir + gitkeep: `database/seed/dr-laura-slack/.gitkeep` if it doesn't exist
- Draft PR titled "feat: ingest_canvas.py — extract knowledge entries from Slack canvases export"
- PR body should include:
  - Canvas count + sample entry from canvases.json
  - load_knowledge.py output (insert count + finalize chain log)
  - SQL verification of leader attribution and confidence distribution
  - One-line note on category-classification choice (LLM vs heuristic)

Report the PR URL + final entry count when done.
