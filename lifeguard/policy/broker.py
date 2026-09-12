"""Deterministic admission gate for proposed actions."""

from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .paths import is_protected_path

REPEAT_FLOOR = 3
POLICY_VERSION = "v1"
ALLOWED_ACTIONS = {"throttle_task", "suspend_task", "stop_task"}


@dataclass(frozen=True)
class Verdict:
    allowed: bool
    reason: str
    action: str | None = None


def allow(action: str) -> Verdict:
    return Verdict(True, "allowed", action)


def deny(reason: str) -> Verdict:
    return Verdict(False, reason)


class Broker:
    def __init__(
        self,
        registry: Any,
        *,
        process_factory: Callable[[int], Any] | None = None,
        policy_version: str = POLICY_VERSION,
        install_dir: Path | None = None,
    ):
        if process_factory is None:
            import psutil

            process_factory = psutil.Process
        self.registry = registry
        self.process_factory = process_factory
        self.policy_version = policy_version
        self.install_dir = install_dir or Path(__file__).resolve().parents[1]

    def _foreground_family_contains(self, foreground_pid: int, target_pid: int) -> bool:
        if foreground_pid == target_pid:
            return True
        try:
            foreground = self.process_factory(foreground_pid)
            parent = foreground.parent()
            family = {foreground_pid}
            if parent is not None:
                family.add(parent.pid)
            family.update(child.pid for child in foreground.children(recursive=False))
            return target_pid in family
        except Exception:
            return True

    @staticmethod
    def _reproduced_count(task: dict[str, Any], cited_lines: list[str]) -> int:
        live = Counter(task.get("evidence_lines", []))
        cited = Counter(cited_lines)
        return sum(min(count, live[line]) for line, count in cited.items())

    def admissible(self, proposal: dict[str, Any], fresh_observation: dict[str, Any], *, now: float | None = None) -> Verdict:
        checked_at = time.time() if now is None else now
        if proposal.get("policy_version") != self.policy_version:
            return deny("policy_changed")
        if checked_at > float(proposal.get("expires_at", 0)):
            return deny("stale_approval")
        if proposal.get("action") not in ALLOWED_ACTIONS:
            return deny("unsupported_action")
        task = self.registry.resolve(str(proposal.get("target_id", "")))
        if task is None:
            return deny("unknown_target")
        try:
            live_created = self.process_factory(int(task["pid"])).create_time()
        except Exception:
            return deny("identity_uncertain")
        if live_created != task.get("create_time"):
            return deny("identity_uncertain")
        if not task.get("owned_channel"):
            return deny("not_managed")
        if task.get("protected") or is_protected_path(Path(task["path"]), self.install_dir):
            return deny("protected")
        foreground = fresh_observation.get("foreground_pid")
        if foreground is None:
            return deny("foreground_unknown")
        if self._foreground_family_contains(int(foreground), int(task["pid"])):
            return deny("foreground")
        if proposal["action"] == "stop_task" and self._reproduced_count(task, proposal.get("cited_lines", [])) < REPEAT_FLOOR:
            return deny("evidence_not_reproduced")
        return allow(proposal["action"])


def admissible(proposal: dict[str, Any], fresh_observation: dict[str, Any]) -> Verdict:
    from lifeguard.registry import REGISTRY

    return Broker(REGISTRY).admissible(proposal, fresh_observation)
