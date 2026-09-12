"""Windows process and memory observation."""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from typing import Any


def foreground_pid() -> int | None:
    dlls = getattr(ctypes, "windll", None)
    if dlls is None:
        return None
    get_foreground_window = dlls.user32.GetForegroundWindow
    get_foreground_window.restype = wintypes.HWND
    get_window_pid = dlls.user32.GetWindowThreadProcessId
    get_window_pid.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    get_window_pid.restype = wintypes.DWORD
    hwnd = get_foreground_window()
    if not hwnd:
        return None
    pid = wintypes.DWORD()
    thread_id = get_window_pid(hwnd, ctypes.byref(pid))
    return pid.value if thread_id and pid.value else None


def memory_snapshot() -> dict[str, int | float]:
    import psutil

    memory = psutil.virtual_memory()
    return {
        "available_mb": memory.available // (1 << 20),
        "total_mb": memory.total // (1 << 20),
        "percent": memory.percent,
    }


def task_sample(proc: Any) -> dict[str, int | float | bool]:
    """Sample a long-lived psutil.Process object; cpu_percent is stateful."""
    with proc.oneshot():
        return {
            "pid": proc.pid,
            "created": proc.create_time(),
            "rss_mb": proc.memory_info().rss // (1 << 20),
            "cpu_pct": proc.cpu_percent(),
            "running": proc.is_running(),
        }
