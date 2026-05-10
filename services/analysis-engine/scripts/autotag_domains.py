"""Auto-tag clinical_knowledge.domains for the existing knowledge corpus.

C.1.2 from docs/MVP-PRIORITIZATION-2026-05-08.md (Layer C). One-shot
backfill — wiring auto-tagging into the live ingestion pipeline is a
separate item (part of C.1.4).

Strategy: many entries have a `source_channel` that maps near-1:1 to one
of the six functional-health domains we seeded in `knowledge_domains`,
so use channel as a strong prior to avoid LLM cost where it isn't
needed. Fall back to a small Claude classification call for cross-cutting
or unmapped channels.

Idempotent: only updates rows where `domains = '{}'` (the schema default).
Re-running after the corpus grows is safe.

Usage (inside the analysis-engine container):
    python scripts/autotag_domains.py [--dry-run] [--limit N]

Requires DATABASE_URL and ANTHROPIC_API_KEY to be set.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

# Make `app.*` imports work when invoked from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402
from anthropic import Anthropic  # noqa: E402

PROMPT_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "domain_classification_v1.md"
)
PROMPT_VERSION = "domain_classification_v1"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
MAX_TOKENS = 200
CONTENT_CAP = 1500
BATCH_SIZE = 50

# Canonical domain slugs (also seeded into knowledge_domains by 0017).
# Keeping the source of truth here lets us validate LLM output without a
# round-trip to the DB on every classification.
VALID_DOMAINS: frozenset[str] = frozenset({
    "gut_health",
    "hormones",
    "sleep",
    "metabolism",
    "nervous_system",
    "foundational",
})

# Direct channel → domain(s) mapping. Confidence comes from the channel
# names themselves — these are dedicated topic channels in the source
# Slack export, so the channel name is a strong prior.
#
# Channels NOT listed here (supplements, serum_testing, detox, protocols,
# clientfeedbackrequests, case-studies, chronicdisease, coachingskills,
# skin, fertility, brain-health, peptides, plant-medicine,
# livecallschedule-topics, call_replays, booksandresources,
# products-and-brands-we-love, practitioner_transcript) are cross-cutting
# or content-dependent — fall through to the LLM path.
CHANNEL_MAP: dict[str, list[str]] = {
    "gut-health":                       ["gut_health"],
    "hormones":                         ["hormones"],
    "hormoneai":                        ["hormones"],
    "sleep":                            ["sleep"],
    "metabolic-health-and-blood-sugar": ["metabolism"],
    "fat-loss-and-metabolism":          ["metabolism"],
    "nervoussystemregulation":          ["nervous_system"],
    "mindset":                          ["nervous_system"],
    "nutrition-and-meal-planning":      ["foundational"],
    "fitness-and-exercise":             ["foundational"],
    "biohacking_and_longevity":         ["foundational"],
}


def strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9]*\n", "", s)
        s = re.sub(r"\n```\s*$", "", s)
    return s


class LLMRefusal(Exception):
    """Claude declined to respond (safety classifier)."""


def classify_with_llm(
    client: Anthropic,
    system_prompt: str,
    title: str,
    category: str,
    content: str,
) -> list[str]:
    """Single Claude call. Returns 1-3 valid domain slugs.

    Raises LLMRefusal if Claude's safety classifier blocked the response,
    or ValueError if the body can't be parsed or contains zero valid
    slugs after filtering.
    """
    user_content = (
        f"Title: {title}\n"
        f"Category: {category}\n"
        f"Content: {content[:CONTENT_CAP]}"
    )
    msg = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    if msg.stop_reason == "refusal":
        raise LLMRefusal(f"safety refusal (stop_reason=refusal)")
    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    if not raw.strip():
        raise LLMRefusal("empty response (no text blocks)")
    parsed = json.loads(strip_code_fences(raw))
    if not isinstance(parsed, list):
        raise ValueError(f"expected JSON array, got {type(parsed).__name__}")
    cleaned = [s for s in parsed if isinstance(s, str) and s in VALID_DOMAINS]
    if not cleaned:
        raise ValueError(f"no valid slugs after filtering: {parsed!r}")
    # De-dupe while preserving order, cap at 3.
    seen: set[str] = set()
    out: list[str] = []
    for s in cleaned:
        if s not in seen:
            seen.add(s)
            out.append(s)
        if len(out) >= 3:
            break
    return out


def fetch_tenants(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM tenants ORDER BY id")
        return [str(r[0]) for r in cur.fetchall()]


def fetch_untagged(conn: psycopg.Connection) -> list[tuple]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, source_channel, category, title, content
              FROM clinical_knowledge
             WHERE domains = '{}'
             ORDER BY created_at
            """
        )
        return cur.fetchall()


def flush_batch(
    conn: psycopg.Connection,
    updates: list[tuple[str, list[str]]],
) -> int:
    """Apply a batch of (id, domains) updates in a single transaction.

    Re-checks `domains = '{}'` in the WHERE clause so a concurrent run
    can't double-write. Returns count of rows actually updated.
    """
    if not updates:
        return 0
    n = 0
    with conn.cursor() as cur:
        for rid, domains in updates:
            cur.execute(
                """
                UPDATE clinical_knowledge
                   SET domains = %s
                 WHERE id = %s AND domains = '{}'
                """,
                (domains, rid),
            )
            n += cur.rowcount
    conn.commit()
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="Classify but do not write back to the DB.")
    ap.add_argument("--limit", type=int, default=0,
                    help="Cap rows processed per tenant (0 = all).")
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    client = Anthropic(api_key=api_key)

    totals_processed = 0
    totals_channel = 0
    totals_llm = 0
    totals_refusal_fallback = 0
    totals_failed = 0
    totals_written = 0
    domain_counts: dict[str, int] = {d: 0 for d in VALID_DOMAINS}
    start = time.time()

    # `tenants` has no RLS (verified at runtime — see migration history),
    # so a single connection can list them and then iterate per-tenant
    # with `app.current_tenant_id` set per pass.
    conn = psycopg.connect(db_url, autocommit=False)
    try:
        tenants = fetch_tenants(conn)
        print(f"[autotag] tenants discovered: {len(tenants)}", flush=True)

        for tenant_id in tenants:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT set_config('app.current_tenant_id', %s, false)",
                    (tenant_id,),
                )
            conn.commit()

            rows = fetch_untagged(conn)
            if args.limit:
                rows = rows[: args.limit]
            print(
                f"[autotag] tenant {tenant_id}: "
                f"{len(rows)} untagged rows",
                flush=True,
            )

            updates: list[tuple[str, list[str]]] = []
            for rid, channel, category, title, content in rows:
                domains: list[str] | None = None

                if channel in CHANNEL_MAP:
                    domains = CHANNEL_MAP[channel]
                    totals_channel += 1
                else:
                    try:
                        domains = classify_with_llm(
                            client, system_prompt,
                            title or "", category or "", content or "",
                        )
                        totals_llm += 1
                    except LLMRefusal as err:
                        # Claude's safety classifier blocked the response —
                        # observed on benign clinical content (e.g. H. pylori
                        # supplement guidance) where the model treats the
                        # underlying condition as off-limits. Fall back to
                        # `foundational` (the cross-cutting catch-all per the
                        # seeded knowledge_domains description) so the row
                        # still gets a tag we can audit later.
                        domains = ["foundational"]
                        totals_refusal_fallback += 1
                        print(
                            f"[autotag] REFUSAL row {rid} "
                            f"channel={channel!r} title={title!r}: "
                            f"{err} — defaulting to ['foundational']",
                            file=sys.stderr,
                            flush=True,
                        )
                    except Exception as err:
                        print(
                            f"[autotag] FAILED row {rid} "
                            f"channel={channel!r}: "
                            f"{type(err).__name__}: {err}",
                            file=sys.stderr,
                            flush=True,
                        )
                        totals_failed += 1
                        continue

                updates.append((str(rid), domains))
                for d in domains:
                    domain_counts[d] = domain_counts.get(d, 0) + 1

                if len(updates) >= BATCH_SIZE:
                    if not args.dry_run:
                        totals_written += flush_batch(conn, updates)
                    totals_processed += len(updates)
                    updates = []
                    print(
                        f"[autotag] processed={totals_processed} "
                        f"channel={totals_channel} llm={totals_llm} "
                        f"failed={totals_failed} "
                        f"elapsed={time.time() - start:.1f}s",
                        flush=True,
                    )

            # Flush trailing partial batch.
            if updates:
                if not args.dry_run:
                    totals_written += flush_batch(conn, updates)
                totals_processed += len(updates)
                updates = []
    finally:
        conn.close()

    print()
    print(f"[autotag] DONE in {time.time() - start:.1f}s")
    print(f"[autotag]   processed:        {totals_processed}")
    print(f"[autotag]   channel-mapped:   {totals_channel}")
    print(f"[autotag]   llm-classified:   {totals_llm}")
    print(f"[autotag]   refusal-fallback: {totals_refusal_fallback}")
    print(f"[autotag]   failed:           {totals_failed}")
    print(f"[autotag]   rows written:     "
          f"{totals_written}{' (dry-run, 0 written)' if args.dry_run else ''}")
    print(f"[autotag] domain breakdown (entries can carry 1-3 tags):")
    for d in sorted(domain_counts, key=lambda k: domain_counts[k], reverse=True):
        print(f"   {d:16s} {domain_counts[d]}")

    return 0 if totals_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
