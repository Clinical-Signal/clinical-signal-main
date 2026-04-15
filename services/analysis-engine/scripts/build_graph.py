"""Build the clinical concept graph from knowledge items.

Streams knowledge items in batches to Claude with the graph-extraction
prompt, upserts concepts, and inserts typed relationships.

Usage (inside analysis-engine container):
    python scripts/build_graph.py \
        --tenant 00000000-0000-0000-0000-000000000001 \
        --batch-size 20
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from anthropic import Anthropic  # noqa: E402
from app.knowledge.db import (  # noqa: E402
    find_concept,
    insert_relationship,
    upsert_concept,
)
from app.knowledge.embeddings import embed_one  # noqa: E402
from app.pipeline.db import tenant_conn  # noqa: E402

PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "graph_extraction_v1.md"
)
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
MAX_TOKENS = 16000


def strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9]*\n", "", s)
        s = re.sub(r"\n```\s*$", "", s)
    return s


def fetch_knowledge_batch(tenant_id: str, offset: int, limit: int) -> list[dict]:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, category, title, content, metadata
              FROM clinical_knowledge
             ORDER BY created_at ASC
             OFFSET %s LIMIT %s
            """,
            (offset, limit),
        )
        rows = cur.fetchall()
    return [
        {
            "id": str(r[0]),
            "category": r[1],
            "title": r[2],
            "content": r[3],
            "metadata": r[4] or {},
        }
        for r in rows
    ]


def format_batch_for_prompt(items: list[dict]) -> str:
    lines: list[str] = []
    for i, it in enumerate(items):
        lines.append(f"## Item {i + 1}: {it['title']}")
        lines.append(f"Category: {it['category']}")
        lines.append(f"Content: {it['content']}")
        md = it["metadata"]
        if md.get("conditions"):
            lines.append(f"Conditions: {', '.join(md['conditions'])}")
        if md.get("symptoms"):
            lines.append(f"Symptoms: {', '.join(md['symptoms'])}")
        if md.get("lab_markers"):
            markers = [
                (m.get("marker") if isinstance(m, dict) else str(m))
                for m in md["lab_markers"]
            ]
            lines.append(f"Lab markers: {', '.join(str(m) for m in markers if m)}")
        if md.get("supplements"):
            supps = [
                (s.get("name") if isinstance(s, dict) else str(s))
                for s in md["supplements"]
            ]
            lines.append(f"Supplements: {', '.join(str(s) for s in supps if s)}")
        if md.get("sequencing_notes"):
            lines.append(f"Sequencing: {md['sequencing_notes']}")
        if md.get("clinical_reasoning"):
            lines.append(f"Reasoning: {md['clinical_reasoning']}")
        lines.append("")
    return "\n".join(lines)


def call_graph_extractor(
    client: Anthropic, system_prompt: str, batch_text: str
) -> dict:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": (
                    "Extract concepts and typed relationships from the "
                    "following clinical knowledge items. Respond with JSON "
                    "only.\n\n<items>\n" + batch_text + "\n</items>"
                ),
            }
        ],
    )
    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    return json.loads(strip_code_fences(raw))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--batch-size", type=int, default=20)
    ap.add_argument("--max-batches", type=int, default=0, help="0 = all")
    args = ap.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2
    client = Anthropic(api_key=api_key)
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")

    concept_ids: dict[tuple[str, str], str] = {}

    def resolve_concept(c: dict) -> str | None:
        ctype = (c.get("concept_type") or "other").strip().lower()
        name = (c.get("name") or "").strip().lower()
        if not name:
            return None
        key = (ctype, name)
        if key in concept_ids:
            return concept_ids[key]
        description = c.get("description")
        try:
            emb = embed_one(f"{ctype}: {name}. {description or ''}")
        except Exception:
            emb = None
        cid = upsert_concept(
            tenant_id=args.tenant,
            concept_type=ctype,
            name=name,
            description=description,
            embedding=emb,
            metadata={"first_seen_at": int(time.time())},
        )
        concept_ids[key] = cid
        return cid

    total = 0
    total_rels = 0
    total_concepts = 0
    batch_index = 0
    offset = 0
    while True:
        items = fetch_knowledge_batch(args.tenant, offset, args.batch_size)
        if not items:
            break
        offset += len(items)
        batch_index += 1
        print(
            f"[graph] batch {batch_index} items={len(items)} "
            f"offset_after={offset}",
            flush=True,
        )
        batch_text = format_batch_for_prompt(items)
        try:
            result = call_graph_extractor(client, system_prompt, batch_text)
        except Exception as err:
            print(
                f"[graph] batch {batch_index} FAILED: "
                f"{type(err).__name__}: {err}",
                file=sys.stderr,
            )
            if args.max_batches and batch_index >= args.max_batches:
                break
            continue

        concepts = result.get("concepts") or []
        rels = result.get("relationships") or []

        # Upsert concepts first so relationships can reference them.
        for c in concepts:
            if resolve_concept(c):
                total_concepts += 1

        for r in rels:
            src = resolve_concept(r.get("source") or {})
            tgt = resolve_concept(r.get("target") or {})
            if not src or not tgt:
                continue
            rel_id = insert_relationship(
                tenant_id=args.tenant,
                source_id=src,
                target_id=tgt,
                relationship_type=(r.get("relationship_type") or "").strip().lower(),
                strength=r.get("strength"),
                evidence=r.get("evidence"),
                metadata={"batch_index": batch_index},
            )
            if rel_id:
                total_rels += 1

        total += len(items)
        if args.max_batches and batch_index >= args.max_batches:
            break

    print(
        f"[graph] done items_processed={total} "
        f"concepts_upserted={total_concepts} rels_inserted={total_rels}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
