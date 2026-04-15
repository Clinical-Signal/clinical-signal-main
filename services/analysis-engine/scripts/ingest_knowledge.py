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
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
MAX_TOKENS = 12000


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
    msgs = load_messages(in_path)
    chunks = chunk_messages(msgs, args.chunk_size)
    if args.max_chunks:
        chunks = chunks[: args.max_chunks]
    print(
        f"[ingest] channel={args.channel} messages={len(msgs)} "
        f"chunks={len(chunks)} chunk_size={args.chunk_size}"
    )

    client = Anthropic(api_key=api_key)
    total_items = 0
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
            for item in items:
                item["_source"] = {
                    "channel": args.channel,
                    "chunk_index": i,
                    "chunk_hash": chash,
                }
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
                # Running tallies.
                ex = item.get("_extraction", {})
                total_in_tok += ex.get("input_tokens", 0)
                total_out_tok += ex.get("output_tokens", 0)
            total_items += len(items)
            if (i + 1) % 10 == 0 or i == len(chunks) - 1:
                elapsed = time.time() - start
                print(
                    f"[ingest] chunk {i + 1}/{len(chunks)} "
                    f"items={total_items} tok_in={total_in_tok} "
                    f"tok_out={total_out_tok} elapsed={elapsed:.1f}s",
                    flush=True,
                )

    print(
        f"[ingest] done. items={total_items} "
        f"tok_in={total_in_tok} tok_out={total_out_tok} "
        f"out={out_path}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
