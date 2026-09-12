"""Short-lived, single-use approval tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time

SECRET = secrets.token_bytes(32)
USED: set[str] = set()
_USED_LOCK = threading.Lock()


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def mint(proposal_id: str, decision: str, proposal_hash: str, ttl: int = 120) -> str:
    if decision not in {"approve", "deny"}:
        raise ValueError("decision must be approve or deny")
    exp = int(time.time()) + ttl
    nonce = secrets.token_hex(8)
    payload = f"{proposal_id}|{decision}|{proposal_hash}|{exp}|{nonce}"
    signature = hmac.new(SECRET, payload.encode(), hashlib.sha256).digest()
    return f"{_b64u(payload.encode())}.{_b64u(signature)}"


def consume(token: str) -> dict[str, str] | None:
    """Verify and atomically consume a token, returning its bound decision."""
    try:
        raw, supplied_signature = token.rsplit(".", 1)
        payload = _decode(raw).decode("utf-8")
        expected = hmac.new(SECRET, payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64u(expected), supplied_signature):
            return None
        proposal_id, decision, proposal_hash, exp, _nonce = payload.split("|")
        if decision not in {"approve", "deny"} or time.time() > float(exp):
            return None
        with _USED_LOCK:
            if token in USED:
                return None
            USED.add(token)
        return {
            "proposal_id": proposal_id,
            "decision": decision,
            "proposal_hash": proposal_hash,
        }
    except (TypeError, ValueError, UnicodeError):
        return None
