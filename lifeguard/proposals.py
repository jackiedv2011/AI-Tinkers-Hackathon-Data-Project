"""In-memory proposal storage; restart invalidates pending approvals."""

from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from typing import Any


def proposal_hash(proposal: dict[str, Any]) -> str:
    content = {key: value for key, value in proposal.items() if key != "proposal_hash"}
    encoded = json.dumps(content, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()[:16]


class ProposalStore:
    def __init__(self):
        self._items: dict[str, dict[str, Any]] = {}
        self._claimed: set[str] = set()
        self._lock = threading.Lock()

    def add(self, proposal: dict[str, Any], ttl: int = 120) -> dict[str, Any]:
        item = dict(proposal)
        item.setdefault("proposal_id", str(uuid.uuid4()))
        item.setdefault("created_at", time.time())
        item.setdefault("expires_at", item["created_at"] + ttl)
        item.setdefault("policy_version", "v1")
        item["proposal_hash"] = proposal_hash(item)
        with self._lock:
            self._items[item["proposal_id"]] = item
        return dict(item)

    def resolve(self, proposal_id: str, expected_hash: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._items.get(proposal_id)
            if item is None or item["proposal_hash"] != expected_hash:
                return None
            return dict(item)

    def claim(self, proposal_id: str, expected_hash: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._items.get(proposal_id)
            if item is None or item["proposal_hash"] != expected_hash or proposal_id in self._claimed:
                return None
            self._claimed.add(proposal_id)
            return dict(item)


PROPOSALS = ProposalStore()
