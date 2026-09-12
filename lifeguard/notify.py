"""ntfy push and local Windows toast notifications."""

from __future__ import annotations

import secrets
from typing import Any

NTFY_TOPIC = secrets.token_hex(8)
NTFY_BASE = f"https://ntfy.sh/{NTFY_TOPIC}"


def action_header(approve_token: str, deny_token: str, callback_url: str) -> str:
    endpoint = f"{callback_url.rstrip('/')}/decision"
    return (
        f'http, Approve, {endpoint}, method=POST, headers.Authorization=Bearer {approve_token}, '
        'headers.Content-Type=application/json, body={"decision":"approve"}; '
        f'http, Deny, {endpoint}, method=POST, headers.Authorization=Bearer {deny_token}, '
        'headers.Content-Type=application/json, body={"decision":"deny"}'
    )


def push_proposal(proposal: dict[str, Any], approve_token: str, deny_token: str, callback_url: str) -> None:
    import httpx

    response = httpx.post(
        NTFY_BASE,
        headers={
            "Title": "Lifeguard: Action Required",
            "Priority": "high",
            "Actions": action_header(approve_token, deny_token, callback_url),
            "Content-Type": "text/plain",
        },
        content=f"{proposal['action']} → {proposal['diagnosis'][:120]}",
        timeout=10,
    )
    response.raise_for_status()
    try:
        from win11toast import toast

        toast(
            "Lifeguard: Action Required",
            f"{proposal['action']}: {proposal['diagnosis'][:100]}",
            buttons=[
                {"activationType": "foreground", "arguments": "open-ntfy", "content": "Open ntfy"}
            ],
        )
    except Exception:
        pass


def push_confirmation(outcome: str) -> None:
    import httpx

    response = httpx.post(
        NTFY_BASE,
        headers={"Title": f"Lifeguard: {outcome}", "Priority": "default"},
        content="Decision completed.",
        timeout=10,
    )
    response.raise_for_status()
