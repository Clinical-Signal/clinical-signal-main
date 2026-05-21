# Slack channel extraction recipe

How to convert raw Slack export daily JSONs into knowledge-base entries.

## Why this exists

`ingest_knowledge.py` reads channel content from a single `.txt` file with messages separated by `---`. The standard Slack export format is one `YYYY-MM-DD.json` per channel per day. `slack_export_to_text.py` bridges the two.

The previous 28 channels in the corpus were ingested via a separate `heuristic_v2_refined` extractor that lived outside this repo and is no longer accessible — the `*-v2.jsonl` files in `database/seed/knowledge/` are the only artifact. New channels (mindset, anything Dr. Laura adds later) use the recipe below.

## End-to-end recipe

Stage the channel folder, run the converter, run the extractor, load. All four steps are idempotent — re-running is a no-op once content has landed in the DB (PR #215's content-hash dedup).

```bash
# 1) Stage the channel folder + users.json from the Slack export bundle.
#    Standard Slack export layout: <bundle>/users.json + <bundle>/<channel>/YYYY-MM-DD.json
#    Copy into the repo under database/seed/dr-laura-slack/raw-export/<channel>/

# 2) Convert daily JSONs → ingest_knowledge.py-compatible text.
docker compose exec -T analysis-engine python /app/scripts/slack_export_to_text.py \
  --channel-dir database/seed/dr-laura-slack/raw-export/mindset \
  --users-json database/seed/dr-laura-slack/raw-export/users.json \
  --channel mindset \
  --output /tmp/mindset.txt

# 3) Run the LLM extraction pass.
docker compose exec -T analysis-engine python /app/scripts/ingest_knowledge.py \
  --input /tmp/mindset.txt \
  --channel mindset \
  --out /knowledge_out/mindset-v2.jsonl \
  --chunk-size 8

# 4) Load + post-ingest finalize.
docker compose exec -T analysis-engine python /app/scripts/load_knowledge.py \
  --input /knowledge_out/mindset-v2.jsonl \
  --tenant 00000000-0000-0000-0000-000000000001
```

## What the converter does

- Walks the channel directory's `YYYY-MM-DD.json` files, sorts all messages chronologically by Slack `ts`.
- Resolves `<@U06ABC123>` user mentions to `@Display Name` using `users.json`. Falls back to the bare user ID when the user isn't in users.json (rare — typically deleted accounts).
- Resolves `<#C06ABC123|channel-name>` channel mentions to `#channel-name`.
- Resolves `<https://url|label>` links to `label (url)`.
- Skips:
  - Bot messages (`bot_id` set, `subtype: bot_message`)
  - System events (`channel_join`, `channel_topic`, etc.) — except `thread_broadcast` which is a real message
  - Reaction-only messages (no `text` body)
  - Tombstoned/deleted entries
- Marks thread replies with `(reply)` in the header so the LLM can see conversation structure.
- Output shape: `[YYYY-MM-DD HH:MM UTC @user]\n<message body>\n\n---\n` per message.

## Tuning chunk size

`ingest_knowledge.py --chunk-size N` controls how many messages join into one LLM extraction call. Tradeoffs:
- Smaller chunks (4-6) = more granular extraction but more LLM calls (cost ↑, time ↑).
- Larger chunks (10-16) = fewer calls, but the LLM may miss items in long chunks.
- Default `8` matches what the legacy `heuristic_v2_refined` pipeline used for the existing 28 channels — start there, adjust if extraction quality is uneven.

For a typical Slack channel (~50-300 daily messages over a year): expect 20-50 chunks, ~$5-12 in API spend, 15-30 min wall time including the faithfulness-check pass.

## What the new entries look like

Entries produced via this recipe carry `_extraction.model_id = "claude-sonnet-4-5"` and a populated `faithfulness_score`, in contrast to the legacy `heuristic_v2_refined` entries (which have `faithfulness_score = NULL`). Both shapes coexist in the DB — the dedup-by-content-hash logic from PR #215 keeps both pipelines idempotent against each other.

## Limitations

- **Thread context isn't fully flattened.** Threaded replies are interleaved chronologically with parent-channel messages, marked `(reply)`. The LLM can usually figure out which thread a reply belongs to from the body. A future enhancement could group reply chains explicitly under their parent — currently not worth the complexity.
- **Slack rich-text formatting (bold, italic, code) is dropped.** The `blocks` field is ignored in favor of the plain `text` field. Slack stores both; the plain text is sufficient for clinical extraction.
- **Files / attachments are not fetched.** A message that says "see attached lab report" doesn't pull the lab report. Out of scope; the lab-ingest path is separate.
