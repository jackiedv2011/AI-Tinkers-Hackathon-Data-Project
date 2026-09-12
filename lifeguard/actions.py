"""Broker-approved Windows actions."""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from typing import Any, Callable

PROCESS_SET_INFORMATION = 0x0200
PROCESS_POWER_THROTTLING = 4
PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 0x1


class PROCESS_POWER_THROTTLING_STATE(ctypes.Structure):
    _fields_ = [
        ("Version", wintypes.ULONG),
        ("ControlMask", wintypes.ULONG),
        ("StateMask", wintypes.ULONG),
    ]


def _process(pid: int, process_factory: Callable[[int], Any] | None = None):
    if process_factory is None:
        import psutil

        process_factory = psutil.Process
    return process_factory(pid)


def apply_ecoqos(pid: int, *, proc: Any | None = None) -> None:
    """Apply Task Manager-style Efficiency mode without pywin32."""
    kernel32 = getattr(ctypes, "windll", None)
    if kernel32 is None:
        raise OSError("EcoQoS is available only on Windows")
    state = PROCESS_POWER_THROTTLING_STATE(
        1,
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
    )
    handle = kernel32.kernel32.OpenProcess(PROCESS_SET_INFORMATION, False, pid)
    if not handle:
        raise ctypes.WinError()
    try:
        succeeded = kernel32.kernel32.SetProcessInformation(
            handle,
            PROCESS_POWER_THROTTLING,
            ctypes.byref(state),
            ctypes.sizeof(state),
        )
        if not succeeded:
            raise ctypes.WinError()
    finally:
        kernel32.kernel32.CloseHandle(handle)
    if proc is None:
        proc = _process(pid)
    import psutil

    proc.nice(psutil.IDLE_PRIORITY_CLASS)


def apply_ecoqus(pid: int) -> None:
    """Compatibility spelling retained from the original revision brief."""
    apply_ecoqos(pid)


def throttle_task(pid: int) -> None:
    apply_ecoqos(pid)


def suspend_task(pid: int) -> None:
    _process(pid).suspend()


def resume_task(pid: int) -> None:
    _process(pid).resume()


def stop_task(pid: int) -> None:
    _process(pid).terminate()


def execute_action(action: str, task: dict[str, Any], *, process_factory: Callable[[int], Any] | None = None) -> None:
    proc = _process(int(task["pid"]), process_factory)
    if proc.create_time() != task["create_time"]:
        raise RuntimeError("Process identity changed before execution")
    if action == "throttle_task":
        apply_ecoqos(proc.pid, proc=proc)
    elif action == "suspend_task":
        proc.suspend()
    elif action == "stop_task":
        proc.terminate()
    else:
        raise ValueError(f"Unsupported action: {action}")
