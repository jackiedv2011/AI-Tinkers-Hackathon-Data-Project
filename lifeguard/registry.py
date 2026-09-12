"""Persistent capability registry for processes launched by Lifeguard."""

from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Callable

ProcessFactory = Callable[[int], Any]


def default_registry_path() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".lifeguard"))
    return base / "Lifeguard" / "registry.json"


class ProcessRegistry:
    def __init__(self, storage_path: Path | None = None, process_factory: ProcessFactory | None = None):
        self.storage_path = Path(storage_path or default_registry_path())
        if process_factory is None:
            def process_factory(pid: int):
                import psutil

                return psutil.Process(pid)
        self._process_factory = process_factory
        self._lock = threading.RLock()
        self._entries: dict[str, dict[str, Any]] = self._load()
        self._processes: dict[str, Any] = {}

    def _load(self) -> dict[str, dict[str, Any]]:
        try:
            value = json.loads(self.storage_path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self._entries, indent=2), encoding="utf-8")
        temporary.replace(self.storage_path)

    def register(
        self,
        pid: int,
        project: str,
        path: str | os.PathLike[str],
        command: list[str],
        *,
        owned_channel: bool = True,
        log_path: str | None = None,
    ) -> str:
        proc = self._process_factory(pid)
        target_id = str(uuid.uuid4())
        entry = {
            "pid": pid,
            "create_time": proc.create_time(),
            "project": project,
            "path": str(Path(path).resolve()),
            "command": list(command),
            "owned_channel": bool(owned_channel),
            "protected": False,
            "log_path": log_path,
        }
        with self._lock:
            self._entries[target_id] = entry
            self._processes[target_id] = proc
            self._save()
        return target_id

    def resolve(self, target_id: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._entries.get(target_id)
            if entry is None:
                return None
            try:
                proc = self._processes.get(target_id)
                if proc is None:
                    proc = self._process_factory(int(entry["pid"]))
                    self._processes[target_id] = proc
                if proc.create_time() != entry["create_time"] or not proc.is_running():
                    self._processes.pop(target_id, None)
                    return None
            except Exception:
                self._processes.pop(target_id, None)
                return None
            return {**entry, "target_id": target_id, "proc": proc}

    def get_managed_tasks(self) -> list[dict[str, Any]]:
        tasks = []
        for target_id in list(self._entries):
            task = self.resolve(target_id)
            if task is not None:
                tasks.append(task)
        return tasks

    def set_evidence(self, target_id: str, lines: list[str]) -> None:
        with self._lock:
            if target_id in self._entries:
                self._entries[target_id]["evidence_lines"] = lines[-200:]
                self._save()


REGISTRY = ProcessRegistry()


def resolve(target_id: str) -> dict[str, Any] | None:
    return REGISTRY.resolve(target_id)


def get_managed_tasks() -> list[dict[str, Any]]:
    return REGISTRY.get_managed_tasks()
