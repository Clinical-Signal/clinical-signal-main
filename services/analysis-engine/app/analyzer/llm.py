"""Claude calls for the clinical analysis + protocol generation steps."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from anthropic import Anthropic

_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")

ANALYSIS_PROMPT_VERSION = "clinical_analysis_v1"
PROTOCOL_PROMPT_VERSION = "protocol_generation_v1"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9]*\n", "", s)
        s = re.sub(r"\n```\s*$", "", s)
    return s


def _client() -> Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return Anthropic(api_key=api_key)


def run_clinical_analysis(timeline_text: str) -> tuple[dict, dict, str]:
    """Returns (findings_json, meta, raw_response_text)."""
    system = _load_prompt(ANALYSIS_PROMPT_VERSION)
    msg = _client().messages.create(
        model=_MODEL,
        max_tokens=16000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": (
                    "Analyze the following patient data. Respond with JSON only "
                    "per the output contract.\n\n<patient_data>\n"
                    + timeline_text
                    + "\n</patient_data>"
                ),
            }
        ],
    )
    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    findings = json.loads(_strip_code_fences(raw))
    meta = {
        "model_id": _MODEL,
        "prompt_version": ANALYSIS_PROMPT_VERSION,
        "token_usage": {
            "input_tokens": msg.usage.input_tokens,
            "output_tokens": msg.usage.output_tokens,
        },
    }
    return findings, meta, raw


def run_protocol_generation(findings: dict) -> tuple[dict, dict, str]:
    """Returns (protocol_json, meta, raw_response_text).

    protocol_json has keys: title, clinical_protocol, client_action_plan, meta.
    """
    system = _load_prompt(PROTOCOL_PROMPT_VERSION)
    msg = _client().messages.create(
        model=_MODEL,
        max_tokens=16000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": (
                    "Produce the clinical protocol AND phased client action plan "
                    "for this patient based on the analysis below. Respond with "
                    "JSON only per the output contract.\n\n<analysis>\n"
                    + json.dumps(findings, default=str)
                    + "\n</analysis>"
                ),
            }
        ],
    )
    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    protocol = json.loads(_strip_code_fences(raw))
    meta = {
        "model_id": _MODEL,
        "prompt_version": PROTOCOL_PROMPT_VERSION,
        "token_usage": {
            "input_tokens": msg.usage.input_tokens,
            "output_tokens": msg.usage.output_tokens,
        },
    }
    return protocol, meta, raw
