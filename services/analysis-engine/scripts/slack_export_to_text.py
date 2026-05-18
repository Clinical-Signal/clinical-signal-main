"""Convert a Slack channel export directory into the text format ingest_knowledge.py consumes.

Slack's standard JSON export produces one `YYYY-MM-DD.json` file per channel per day. Each
file is a JSON array of message objects with a `text` field, a `user` field (Slack user ID
like ``U06ABC123``), an `ts` timestamp, and optional `thread_ts` / `parent_user_id` for
threaded replies. ``ingest_knowledge.py`` reads `.txt` channel files where messages are
separated by lines containing only ``---``.

This script bridges the two:

  raw Slack export (.../mindset/2025-06-22.json, ...)
                        |
                        v
  text file (.../mindset.txt) with `---` separators, ready for ingest_knowledge.py

Usage:
    python scripts/slack_export_to_text.py \\
        --channel-dir database/seed/dr-laura-slack/raw-export/mindset \\
        --users-json database/seed/dr-laura-slack/raw-export/users.json \\
        --channel mindset \\
        --output /knowledge_in/mindset.txt

Then feed to ingest_knowledge.py:
    python scripts/ingest_knowledge.py \\
        --input /knowledge_in/mindset.txt \\
        --channel mindset \\
        --out /knowledge_out/mindset.jsonl

The full end-to-end recipe is documented in docs/SLACK-EXTRACTION-RECIPE.md.

Decisions baked in:
  - Bot messages, system messages, file-share notices, and reactions get skipped — they're
    workspace noise, not clinical content.
  - User IDs in message bodies get resolved to display names (``<@U069...>`` → ``@Dr.
    Laura DeCesaris``). Falls back to the literal ID when the user isn't in users.json.
  - Threaded replies sort chronologically by ``ts`` alongside parent messages — preserves
    conversation flow even when child replies span multiple daily files.
  - Each message is prefixed with a ``[YYYY-MM-DD HH:MM @user]`` header so the LLM
    extractor can attribute claims and detect conversational turn-taking.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


# Slack user-mention pattern: <@U06ABC123> or <@U06ABC123|display_name>
USER_MENTION_RE = re.compile(r"<@(U[A-Z0-9]+)(?:\|[^>]*)?>")
# Channel mentions: <#C06ABC123|channel-name>
CHANNEL_MENTION_RE = re.compile(r"<#C[A-Z0-9]+\|([^>]+)>")
# Bare links: <https://example.com|label> or <https://example.com>
LINK_RE = re.compile(r"<(https?://[^|>]+)(?:\|([^>]+))?>")


def load_users(users_json: Path) -> dict[str, str]:
    """user_id → best-available display name (real_name > name > id)."""
    out: dict[str, str] = {}
    if not users_json.exists():
        print(f"[slack-convert] WARN: no users.json at {users_json} — user IDs won't resolve",
              file=sys.stderr)
        return out
    users = json.loads(users_json.read_text(encoding="utf-8"))
    for u in users:
        uid = u.get("id")
        if not uid:
            continue
        profile = u.get("profile", {}) or {}
        name = (
            profile.get("real_name_normalized")
            or profile.get("real_name")
            or profile.get("display_name_normalized")
            or profile.get("display_name")
            or u.get("real_name")
            or u.get("name")
            or uid
        )
        out[uid] = name
    return out


def resolve_user_mentions(text: str, users: dict[str, str]) -> str:
    def _sub(m: re.Match[str]) -> str:
        uid = m.group(1)
        return f"@{users.get(uid, uid)}"
    return USER_MENTION_RE.sub(_sub, text)


def resolve_channel_mentions(text: str) -> str:
    return CHANNEL_MENTION_RE.sub(lambda m: f"#{m.group(1)}", text)


def resolve_links(text: str) -> str:
    def _sub(m: re.Match[str]) -> str:
        url, label = m.group(1), m.group(2)
        return f"{label} ({url})" if label and label != url else url
    return LINK_RE.sub(_sub, text)


def normalize_message_text(text: str, users: dict[str, str]) -> str:
    text = resolve_user_mentions(text, users)
    text = resolve_channel_mentions(text)
    text = resolve_links(text)
    # Slack emoji codes like ``:white_check_mark:`` survive — the LLM handles them fine.
    return text.strip()


def keep_message(msg: dict) -> bool:
    """Filter to clinical/conversational content only.

    Skip:
      - bot messages (have ``subtype: bot_message`` or a ``bot_id``)
      - system messages (``subtype`` set to anything like ``channel_join``, ``channel_topic``)
      - reaction-only messages (no ``text`` body)
      - tombstoned/deleted entries
    """
    if msg.get("type") != "message":
        return False
    if msg.get("subtype"):
        # Allow ``thread_broadcast`` (real message broadcast to parent channel).
        if msg.get("subtype") != "thread_broadcast":
            return False
    if msg.get("bot_id"):
        return False
    if not (msg.get("text") or "").strip():
        return False
    if msg.get("hidden") or msg.get("is_tombstoned"):
        return False
    return True


def fmt_timestamp(ts: str) -> str:
    """Slack ts is Unix seconds.microseconds. Render as ``YYYY-MM-DD HH:MM UTC``."""
    try:
        seconds = float(ts)
    except (TypeError, ValueError):
        return "????-??-?? ??:??"
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def fmt_message(msg: dict, users: dict[str, str]) -> str:
    """One message → ``[2026-03-26 14:01 UTC @Dr. Laura DeCesaris]\\n<body>`` block."""
    ts = msg.get("ts", "")
    uid = msg.get("user", "")
    user_name = (
        (msg.get("user_profile") or {}).get("real_name")
        or users.get(uid)
        or uid
        or "unknown"
    )
    header = f"[{fmt_timestamp(ts)} @{user_name}]"
    body = normalize_message_text(msg.get("text", ""), users)
    # Mark thread replies so the LLM can see conversation structure.
    if msg.get("thread_ts") and msg.get("thread_ts") != msg.get("ts"):
        header = f"{header} (reply)"
    return f"{header}\n{body}"


def collect_messages(channel_dir: Path) -> list[dict]:
    """Walk all ``YYYY-MM-DD.json`` files, return messages sorted chronologically by ts."""
    msgs: list[dict] = []
    for jp in sorted(channel_dir.glob("*.json")):
        try:
            payload = json.loads(jp.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            print(f"[slack-convert] WARN: {jp.name} — {err}", file=sys.stderr)
            continue
        if not isinstance(payload, list):
            continue
        for m in payload:
            if isinstance(m, dict):
                msgs.append(m)
    # Sort by `ts` (string compares correctly for Slack's float-shaped timestamps).
    msgs.sort(key=lambda m: m.get("ts", ""))
    return msgs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--channel-dir", required=True, type=Path,
                    help="Directory of YYYY-MM-DD.json daily exports for one channel")
    ap.add_argument("--users-json", required=True, type=Path,
                    help="Path to users.json from the same Slack export bundle")
    ap.add_argument("--channel", required=True,
                    help="Channel slug, used as a header line in the output")
    ap.add_argument("--output", required=True, type=Path,
                    help="Output .txt path (ingest_knowledge.py --input)")
    args = ap.parse_args()

    if not args.channel_dir.is_dir():
        print(f"channel-dir not found: {args.channel_dir}", file=sys.stderr)
        return 2

    users = load_users(args.users_json)
    print(f"[slack-convert] loaded {len(users)} users", flush=True)

    all_msgs = collect_messages(args.channel_dir)
    kept = [m for m in all_msgs if keep_message(m)]
    print(f"[slack-convert] {args.channel_dir.name}: {len(all_msgs)} raw → {len(kept)} kept "
          f"({len(all_msgs) - len(kept)} filtered)", flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        # Optional header line for context; ingest_knowledge.py splits on `---` and
        # treats this leading block as its own message — fine because the header is
        # short and ignored by the extractor.
        f.write(f"# Channel: #{args.channel}\n")
        f.write(f"# Source: Slack export ({args.channel_dir.name}), "
                f"{len(kept)} messages\n\n---\n")
        for m in kept:
            f.write(fmt_message(m, users))
            f.write("\n\n---\n")

    print(f"[slack-convert] wrote {args.output} ({args.output.stat().st_size} bytes)",
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
