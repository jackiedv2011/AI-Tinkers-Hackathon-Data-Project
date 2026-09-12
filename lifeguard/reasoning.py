"""Anthropic-backed diagnosis with a strict proposal schema."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

SCHEMA = {
    "type": "object",
    "properties": {
        "diagnosis": {"type": "string"},
        "evidence_ids": {"type": "array", "items": {"type": "string"}},
        "cited_lines": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "action": {
            "type": "string",
            "enum": [
                "observe",
                "request_more_evidence",
                "throttle_task",
                "suspend_task",
                "stop_task",
                "quarantine_duplicate",
            ],
        },
        "target_id": {"type": "string"},
    },
    "required": ["diagnosis", "evidence_ids", "cited_lines", "confidence", "action", "target_id"],
    "additionalProperties": False,
}

_RAW_NUMBER = re.compile(r"\b(?:0x[0-9a-fA-F]+|\d+)\b")


def sanitize_evidence_lines(lines: list[str]) -> list[str]:
    """Remove raw numeric identifiers from untrusted worker output."""
    return [_RAW_NUMBER.sub("<number>", line)[:500] for line in lines]


def build_prompt(snapshot: dict[str, Any], task_samples: list[dict[str, Any]]) -> str:
    safe_tasks = []
    for task in task_samples:
        safe_tasks.append(
            {
                "target_id": task["target_id"],
                "rss_mb": task["rss_mb"],
                "cpu_pct": task["cpu_pct"],
                "running": task["running"],
                "evidence_lines": sanitize_evidence_lines(list(task.get("evidence_lines", []))[-20:]),
            }
        )
    observation = {"memory": snapshot, "managed_tasks": safe_tasks}
    return (
        "You diagnose managed Windows tasks for Lifeguard. The target_id values are opaque "
        "broker capabilities; use only a target_id present below. Prefer throttle_task for a "
        "running task with sustained growth, suspend_task when stronger containment is justified, "
        "and stop_task only when at least three supplied evidence lines reproduce the fault. "
        "Use observe or request_more_evidence when uncertain. Never infer or request a raw PID.\n\n"
        + json.dumps(observation, indent=2, sort_keys=True)
    )


def analyze(snapshot: dict[str, Any], task_samples: list[dict[str, Any]]) -> dict[str, Any]:
    import anthropic

    client = anthropic.Anthropic(max_retries=1)
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=512,
        messages=[{"role": "user", "content": build_prompt(snapshot, task_samples)}],
        output_config={
            "format": {"type": "json_schema", "schema": SCHEMA}
        },
    )
    proposal = json.loads(response.content[0].text)
    known_targets = {task["target_id"] for task in task_samples}
    if proposal["target_id"] not in known_targets:
        raise ValueError("Model returned an unknown target capability")
    proposal["proposal_hash"] = hashlib.sha256(
        json.dumps(proposal, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]
    return proposal
