"""Startup checks for the demo's external and local subsystems."""

from __future__ import annotations


def run_selftest() -> list[str]:
    failures: list[str] = []
    try:
        from .observer import memory_snapshot

        assert memory_snapshot()["total_mb"] > 0
    except Exception as error:
        failures.append(f"observer.memory_snapshot: {error}")
    try:
        from .observer import foreground_pid

        foreground_pid()
    except Exception as error:
        failures.append(f"observer.foreground_pid: {error}")
    try:
        import os
        import psutil

        from .actions import apply_ecoqos

        own_process = psutil.Process(os.getpid())
        previous_priority = own_process.nice()
        try:
            apply_ecoqos(os.getpid(), proc=own_process)
        finally:
            own_process.nice(previous_priority)
    except Exception as error:
        failures.append(f"actions.apply_ecoqos: {error}")
    try:
        import anthropic

        anthropic.Anthropic(max_retries=1).models.list()
    except Exception as error:
        failures.append(f"anthropic connectivity: {error}")
    try:
        from .tokens import consume, mint

        token = mint("selftest", "approve", "abc123")
        assert consume(token) is not None
        assert consume(token) is None
    except Exception as error:
        failures.append(f"tokens round-trip: {error}")
    return failures
