"""CLI for registering managed processes and running the Lifeguard agent."""

from __future__ import annotations

import argparse
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from .notify import NTFY_TOPIC, push_proposal
from .observer import memory_snapshot, task_sample
from .proposals import PROPOSALS
from .reasoning import analyze, sanitize_evidence_lines
from .registry import REGISTRY, get_managed_tasks
from .tokens import mint

TICK_SECONDS = 30
TUNNEL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="lifeguard")
    commands = parser.add_subparsers(dest="mode", required=True)
    run = commands.add_parser("run", help="launch and register a managed process")
    run.add_argument("--project", required=True)
    run.add_argument("command", nargs=argparse.REMAINDER)
    commands.add_parser("agent", help="start observer, callback, tunnel, and tray")
    commands.add_parser("selftest", help="run startup checks")
    return parser


def _strip_separator(command: list[str]) -> list[str]:
    return command[1:] if command and command[0] == "--" else command


def launch_managed(project: str, raw_command: list[str]) -> int:
    command = _strip_separator(raw_command)
    if not command:
        raise SystemExit("A command is required after --")
    log_root = Path.home() / ".lifeguard" / "logs"
    log_root.mkdir(parents=True, exist_ok=True)
    log_path = log_root / f"{uuid.uuid4().hex}.log"
    creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    with log_path.open("ab", buffering=0) as output:
        child = subprocess.Popen(
            command,
            cwd=Path.cwd(),
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags,
        )
    executable = shutil.which(command[0]) or command[0]
    target_id = REGISTRY.register(
        child.pid,
        project,
        executable,
        command,
        owned_channel=True,
        log_path=str(log_path),
    )
    print(f"Managed target registered: {target_id}")
    print(f"Evidence log: {log_path}")
    return 0


def _tunnel_url(process: subprocess.Popen[str], timeout: float = 30) -> str:
    lines: queue.Queue[str] = queue.Queue()

    def read_stderr() -> None:
        assert process.stderr is not None
        for line in process.stderr:
            lines.put(line)

    threading.Thread(target=read_stderr, daemon=True, name="cloudflared-stderr").start()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            line = lines.get(timeout=min(0.5, deadline - time.monotonic()))
        except queue.Empty:
            if process.poll() is not None:
                break
            continue
        match = TUNNEL_PATTERN.search(line)
        if match:
            return match.group(0)
    raise RuntimeError("cloudflared did not provide a quick-tunnel URL")


def _tail_evidence(path: str | None, limit: int = 40) -> list[str]:
    if not path:
        return []
    try:
        lines = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]
        return sanitize_evidence_lines(lines)
    except OSError:
        return []


def run_agent() -> int:
    from . import server
    from .quarantine import recover_incomplete
    from .selftest import run_selftest
    from .tray import start_tray

    print(f"Lifeguard starting. Subscribe to ntfy topic: {NTFY_TOPIC}")
    for recovery in recover_incomplete():
        print(f"Quarantine recovery: {recovery['outcome']} ({recovery['journal']})")
    failures = run_selftest()
    if failures:
        print("SELFTEST FAILED:")
        for failure in failures:
            print(f"  {failure}")
        return 1
    threading.Thread(target=server.start, daemon=True, name="lifeguard-api").start()
    tunnel = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", "http://127.0.0.1:8000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    callback_url = _tunnel_url(tunnel)
    print(f"Approval callback: {callback_url}")
    start_tray(lambda: f"Available: {memory_snapshot()['available_mb']} MB")
    baseline_rss: dict[str, int] = {}
    last_notified: dict[str, float] = {}
    try:
        while True:
            tasks = get_managed_tasks()
            snapshot = memory_snapshot()
            reasoning_samples = []
            triggered = False
            for task in tasks:
                evidence = _tail_evidence(task.get("log_path"))
                REGISTRY.set_evidence(task["target_id"], evidence)
                sample = task_sample(task["proc"])
                baseline_rss.setdefault(task["target_id"], int(sample["rss_mb"]))
                growth = int(sample["rss_mb"]) - baseline_rss[task["target_id"]]
                triggered = triggered or growth >= 20 or float(sample["cpu_pct"]) >= 30
                reasoning_samples.append(
                    {
                        "target_id": task["target_id"],
                        "rss_mb": sample["rss_mb"],
                        "cpu_pct": sample["cpu_pct"],
                        "running": sample["running"],
                        "evidence_lines": evidence,
                    }
                )
            if tasks and (float(snapshot["percent"]) >= 70 or triggered):
                proposal = analyze(snapshot, reasoning_samples)
                if proposal["action"] not in {"observe", "request_more_evidence", "quarantine_duplicate"}:
                    target_id = proposal["target_id"]
                    if time.time() - last_notified.get(target_id, 0) >= 120:
                        stored = PROPOSALS.add(proposal)
                        approve = mint(stored["proposal_id"], "approve", stored["proposal_hash"])
                        deny = mint(stored["proposal_id"], "deny", stored["proposal_hash"])
                        push_proposal(stored, approve, deny, callback_url)
                        last_notified[target_id] = time.time()
            time.sleep(TICK_SECONDS)
    finally:
        tunnel.terminate()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.mode == "run":
        return launch_managed(args.project, args.command)
    if args.mode == "selftest":
        from .selftest import run_selftest

        failures = run_selftest()
        for failure in failures:
            print(failure)
        return 1 if failures else 0
    return run_agent()


if __name__ == "__main__":
    sys.exit(main())
