"""Extract clinical knowledge from a Dr. Laura channel export.

Usage (inside analysis-engine container):
    python scripts/ingest_knowledge.py \
        --input /laura_channels/protocols.txt \
        --channel protocols \
        --out /knowledge_out/protocols.jsonl \
        --chunk-size 8

Chunks the channel by `---` separators, groups N messages per chunk, sends
each chunk to Claude with prompts/knowledge_extraction_v1.md, and appends
one JSON line per extracted knowledge item.
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

# Make `app.*` imports work when invoked from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from anthropic import Anthropic  # noqa: E402

PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "knowledge_extraction_v1.md"
)
FAITHFULNESS_PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "faithfulness_check_v1.md"
)
FAITHFULNESS_PROMPT_VERSION = "faithfulness_check_v1"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
MAX_TOKENS = 12000
FAITHFULNESS_MAX_TOKENS = 400

# C.1.4 thresholds. Tunable in one place.
#   < REJECT_THRESHOLD          → entry is dropped from the JSONL output
#   REJECT  ≤ score < REVIEW    → stored, but flagged for review
#                                 (review_status = 'pending_review',
#                                 picked up by C.1.5 auto-flag step)
#   ≥ REVIEW_THRESHOLD          → stored clean
REJECT_THRESHOLD = 0.50
REVIEW_THRESHOLD = 0.75


def load_messages(path: Path) -> list[str]:
    """Split the channel file into individual messages on `---` separators."""
    raw = path.read_text(encoding="utf-8")
    # Messages are separated by lines containing only `---`. Splitting on that
    # pattern keeps the date stamp and body together for each message.
    parts = re.split(r"\n---\n", raw)
    msgs = [p.strip() for p in parts if p.strip()]
    return msgs


def chunk_messages(msgs: list[str], size: int) -> list[list[str]]:
    return [msgs[i : i + size] for i in range(0, len(msgs), size)]


def hash_chunk(chunk_text: str) -> str:
    return hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()


def strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9]*\n", "", s)
        s = re.sub(r"\n```\s*$", "", s)
    return s


def extract_chunk(client: Anthropic, system_prompt: str, chunk_text: str) -> list[dict]:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": (
                    "Extract clinical knowledge from the following messages. "
                    "Respond with JSON only.\n\n<messages>\n"
                    + chunk_text
                    + "\n</messages>"
                ),
            }
        ],
    )
    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    data = json.loads(strip_code_fences(raw))
    items = data.get("knowledge_items") or []
    # Attach token usage so the loader can report totals later.
    for item in items:
        item.setdefault("_extraction", {}).update(
            {
                "model_id": MODEL,
                "prompt_version": "knowledge_extraction_v1",
                "input_tokens": msg.usage.input_tokens,
                "output_tokens": msg.usage.output_tokens,
            }
        )
    return items


def _summarize_item_for_check(item: dict) -> str:
    """Render the structured entry as plain text for the faithfulness pass.

    We deliberately drop the `_extraction` / `_source` housekeeping fields
    so the evaluator sees only the substantive content the entry asserts.
    """
    keys = (
        "category", "title", "content", "conditions", "symptoms",
        "lab_markers", "supplements", "sequencing_notes",
        "contraindications", "clinical_reasoning",
    )
    visible = {k: item[k] for k in keys if item.get(k)}
    return json.dumps(visible, ensure_ascii=False, indent=2)


def evaluate_faithfulness(
    client: Anthropic,
    system_prompt: str,
    source_chunk: str,
    item: dict,
) -> dict:
    """Second-pass evaluation. Returns a dict with keys
    `faithfulness_score`, `faithfulness_breakdown`, `faithfulness_notes`.

    Score is min(recall, precision, nuance) — the weakest dimension drives
    the result, because any one being broken means the entry is misleading.

    Raises on parse / API failure; the caller decides whether that is fatal
    for the chunk or just for this item.
    """
    user_content = (
        "Evaluate the extraction below against its source.\n\n"
        "<source_chunk>\n" + source_chunk + "\n</source_chunk>\n\n"
        "<extracted_entry>\n" + _summarize_item_for_check(item) + "\n</extracted_entry>"
    )
    msg = client.messages.create(
        model=MODEL,
        max_tokens=FAITHFULNESS_MAX_TOKENS,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    if msg.stop_reason == "refusal":
        # Safety classifier decided not to respond. The faithfulness prompt
        # explicitly frames this as metadata work to avoid this case, but if
        # it still happens we surface it rather than silently swallowing.
        raise RuntimeError("faithfulness check refused (stop_reason=refusal)")

    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    if not raw.strip():
        raise RuntimeError("faithfulness check returned no text blocks")

    breakdown = json.loads(strip_code_fences(raw))
    # Validate and clamp.
    recall = float(breakdown.get("recall", 0.0))
    precision = float(breakdown.get("precision", 0.0))
    nuance = float(breakdown.get("nuance", 0.0))
    for v in (recall, precision, nuance):
        if not (0.0 <= v <= 1.0):
            raise ValueError(
                f"faithfulness dimension out of [0,1]: "
                f"recall={recall} precision={precision} nuance={nuance}"
            )
    score = round(min(recall, precision, nuance), 2)
    return {
        "faithfulness_score": score,
        "faithfulness_breakdown": {
            "recall": recall,
            "precision": precision,
            "nuance": nuance,
            "model_id": MODEL,
            "prompt_version": FAITHFULNESS_PROMPT_VERSION,
            "input_tokens": msg.usage.input_tokens,
            "output_tokens": msg.usage.output_tokens,
        },
        "faithfulness_notes": breakdown.get("notes"),
    }


def faithfulness_bucket(score: float) -> str:
    """Map a faithfulness score to one of {'reject', 'review', 'clean'}."""
    if score < REJECT_THRESHOLD:
        return "reject"
    if score < REVIEW_THRESHOLD:
        return "review"
    return "clean"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True, help="path to channel .txt")
    ap.add_argument("--channel", required=True, help="channel slug (e.g. 'protocols')")
    ap.add_argument("--out", required=True, help="output .jsonl path")
    ap.add_argument("--chunk-size", type=int, default=8)
    ap.add_argument("--max-chunks", type=int, default=0, help="cap for smoke tests")
    args = ap.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    in_path = Path(args.input)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    faithfulness_prompt = FAITHFULNESS_PROMPT_PATH.read_text(encoding="utf-8")
    msgs = load_messages(in_path)
    chunks = chunk_messages(msgs, args.chunk_size)
    if args.max_chunks:
        chunks = chunks[: args.max_chunks]
    print(
        f"[ingest] channel={args.channel} messages={len(msgs)} "
        f"chunks={len(chunks)} chunk_size={args.chunk_size} "
        f"reject<{REJECT_THRESHOLD} review<{REVIEW_THRESHOLD}"
    )

    client = Anthropic(api_key=api_key)
    total_items_extracted = 0
    total_items_kept = 0
    total_items_rejected = 0
    total_items_review = 0
    total_items_failed_check = 0
    total_in_tok = 0
    total_out_tok = 0
    start = time.time()

    with out_path.open("w", encoding="utf-8") as f:
        for i, chunk in enumerate(chunks):
            chunk_text = "\n\n---\n\n".join(chunk)
            chash = hash_chunk(chunk_text)
            try:
                items = extract_chunk(client, system_prompt, chunk_text)
            except Exception as err:
                print(
                    f"[ingest] chunk {i + 1}/{len(chunks)} FAILED: "
                    f"{type(err).__name__}: {err}",
                    file=sys.stderr,
                )
                continue
            total_items_extracted += len(items)
            for item in items:
                item["_source"] = {
                    "channel": args.channel,
                    "chunk_index": i,
                    "chunk_hash": chash,
                }
                # Faithfulness pass — second LLM call evaluating this entry
                # against its source chunk. Failures here don't block the
                # whole chunk; they mark the item as unscored and let it
                # through (NULL faithfulness in the DB), so a transient API
                # blip doesn't drop content silently.
                try:
                    fcheck = evaluate_faithfulness(
                        client, faithfulness_prompt, chunk_text, item,
                    )
                except Exception as err:
                    print(
                        f"[ingest] FAITH-CHECK-FAILED chunk={chash[:8]} "
                        f"title={item.get('title')!r}: "
                        f"{type(err).__name__}: {err}",
                        file=sys.stderr,
                        flush=True,
                    )
                    total_items_failed_check += 1
                    fcheck = None

                if fcheck is not None:
                    score = fcheck["faithfulness_score"]
                    bucket = faithfulness_bucket(score)
                    item["faithfulness_score"] = score
                    item["faithfulness_breakdown"] = fcheck["faithfulness_breakdown"]
                    item["faithfulness_notes"] = fcheck["faithfulness_notes"]
                    # Token tally for the faithfulness call too.
                    total_in_tok += fcheck["faithfulness_breakdown"]["input_tokens"]
                    total_out_tok += fcheck["faithfulness_breakdown"]["output_tokens"]
                    if bucket == "reject":
                        total_items_rejected += 1
                        print(
                            f"[ingest] REJECT chunk={chash[:8]} "
                            f"title={item.get('title')!r} "
                            f"score={score} reason={item['faithfulness_notes']!r}",
                            file=sys.stderr,
                            flush=True,
                        )
                        continue  # do NOT write this entry to JSONL
                    if bucket == "review":
                        item["review_status"] = "pending_review"
                        total_items_review += 1

                f.write(json.dumps(item, ensure_ascii=False) + "\n")
                total_items_kept += 1
                # Extraction-call token tally (faithfulness already added above).
                ex = item.get("_extraction", {})
                total_in_tok += ex.get("input_tokens", 0)
                total_out_tok += ex.get("output_tokens", 0)

            if (i + 1) % 10 == 0 or i == len(chunks) - 1:
                elapsed = time.time() - start
                print(
                    f"[ingest] chunk {i + 1}/{len(chunks)} "
                    f"extracted={total_items_extracted} kept={total_items_kept} "
                    f"reject={total_items_rejected} review={total_items_review} "
                    f"check_failed={total_items_failed_check} "
                    f"tok_in={total_in_tok} tok_out={total_out_tok} "
                    f"elapsed={elapsed:.1f}s",
                    flush=True,
                )

    print(
        f"[ingest] done. extracted={total_items_extracted} kept={total_items_kept} "
        f"reject={total_items_rejected} review={total_items_review} "
        f"check_failed={total_items_failed_check} "
        f"tok_in={total_in_tok} tok_out={total_out_tok} out={out_path}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
