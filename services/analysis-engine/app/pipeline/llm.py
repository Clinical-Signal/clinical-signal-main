"""Claude-backed structured extraction for lab reports."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from anthropic import Anthropic

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "lab_extraction_v1.md"
_PROMPT_VERSION = "lab_extraction_v1"
_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        # Strip opening fence line and trailing fence.
        s = re.sub(r"^```[a-zA-Z0-9]*\n", "", s)
        s = re.sub(r"\n```\s*$", "", s)
    return s


def extract_structured_labs(extracted_text: str) -> tuple[dict, dict]:
    """Calls Claude to convert raw PDF text into a structured labs JSON.

    Returns (structured_data, extraction_meta). Raises on API / parse failure;
    the caller is responsible for marking the record as failed.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    client = Anthropic(api_key=api_key)
    system = _load_prompt()

    # Cap input to keep costs predictable. Lab PDFs rarely exceed a few thousand
    # tokens; trimming at ~60k chars is generous.
    text = extracted_text[:60_000]

    msg = client.messages.create(
        model=_MODEL,
        max_tokens=16000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": (
                    "Extract every lab value from the following report text. "
                    "Respond with JSON only.\n\n<report>\n" + text + "\n</report>"
                ),
            }
        ],
    )

    raw = "".join(block.text for block in msg.content if getattr(block, "type", None) == "text")
    cleaned = _strip_code_fences(raw)
    structured = json.loads(cleaned)  # raises if malformed

    meta = {
        "model_id": _MODEL,
        "prompt_version": _PROMPT_VERSION,
        "token_usage": {
            "input_tokens": msg.usage.input_tokens,
            "output_tokens": msg.usage.output_tokens,
        },
    }
    return structured, meta
