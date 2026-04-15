"""Load extracted knowledge JSONL into clinical_knowledge with local embeddings.

Usage (inside analysis-engine container):
    python scripts/load_knowledge.py \
        --input /knowledge_out/protocols.jsonl \
        --tenant 00000000-0000-0000-0000-000000000001
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.knowledge.db import insert_knowledge_item  # noqa: E402
from app.knowledge.embeddings import embed  # noqa: E402


def _embed_text(item: dict) -> str:
    """What we embed. Prefer full content + key structured fields so searches
    like 'HPA axis' can hit items whose title doesn't say that explicitly."""
    parts = [item.get("title", ""), item.get("content", "")]
    reasoning = item.get("clinical_reasoning")
    if reasoning:
        parts.append(reasoning)
    seq = item.get("sequencing_notes")
    if seq:
        parts.append(seq)
    for key in ("conditions", "symptoms"):
        vals = item.get(key) or []
        if vals:
            parts.append(", ".join(str(v) for v in vals))
    return "\n".join(p for p in parts if p).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True)
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--batch", type=int, default=32, help="embedding batch size")
    args = ap.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(f"input not found: {path}", file=sys.stderr)
        return 2

    items: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    print(f"[load] items={len(items)}", flush=True)

    if not items:
        return 0

    # Batch-embed the text we intend to search against.
    texts = [_embed_text(it) for it in items]
    vectors: list[list[float]] = []
    t0 = time.time()
    for i in range(0, len(texts), args.batch):
        batch = texts[i : i + args.batch]
        vectors.extend(embed(batch))
        print(
            f"[load] embedded {len(vectors)}/{len(texts)} "
            f"elapsed={time.time() - t0:.1f}s",
            flush=True,
        )

    inserted = 0
    skipped = 0
    for item, vec in zip(items, vectors):
        src = item.get("_source") or {}
        metadata = {
            "conditions": item.get("conditions") or [],
            "symptoms": item.get("symptoms") or [],
            "lab_markers": item.get("lab_markers") or [],
            "supplements": item.get("supplements") or [],
            "sequencing_notes": item.get("sequencing_notes"),
            "contraindications": item.get("contraindications") or [],
            "clinical_reasoning": item.get("clinical_reasoning"),
            "extraction": item.get("_extraction") or {},
        }
        rid = insert_knowledge_item(
            tenant_id=args.tenant,
            category=item.get("category") or "other",
            title=(item.get("title") or "")[:200] or "(untitled)",
            content=item.get("content") or "",
            embedding=vec,
            metadata=metadata,
            source_channel=src.get("channel"),
            source_chunk_hash=src.get("chunk_hash"),
        )
        if rid:
            inserted += 1
        else:
            skipped += 1

    print(f"[load] done inserted={inserted} skipped_duplicates={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
