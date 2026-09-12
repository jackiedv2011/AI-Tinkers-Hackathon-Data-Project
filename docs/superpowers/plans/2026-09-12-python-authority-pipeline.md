# Lifeguard Python Authority Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runnable Windows-only Python baseline proving LLM diagnosis, deterministic admission, single-use human approval, and broker-controlled execution.

**Architecture:** Keep the existing Electron MVP intact and add an independent `lifeguard` Python package. Persist only managed process capabilities; keep proposals and approval secrets in memory; resolve every action against fresh process identity and foreground state.

**Tech Stack:** Python 3.11+, psutil 7.x, ctypes, FastAPI, uvicorn, Anthropic SDK, httpx/ntfy, pystray, win11toast, Pillow, pytest.

**Spec:** `C:/Users/sidha/.codex/attachments/2ef55f35-c0f3-4b81-b60f-8ce8ab668c18/pasted-text.txt`

## Global Constraints

- Windows-only; no pywin32 and no process killing through `kill()` or `TerminateProcess`.
- Raw PIDs never cross the reasoning/API capability boundary.
- Tokens travel only in the `Authorization` header and are single-use.
- FastAPI binds only to `127.0.0.1`; cloudflared provides the public callback.
- Protected paths and foreground uncertainty fail closed.
- Existing Electron/React behavior remains unchanged.

---

### Task 1: Security primitives and managed registry

**Files:** Create `lifeguard/tokens.py`, `lifeguard/registry.py`, `lifeguard/observer.py`, `lifeguard/policy/paths.py`, and focused tests under `tests/`.

**Interfaces:** Produce `mint`, `consume`, `ProcessRegistry`, `get_managed_tasks`, `foreground_pid`, `memory_snapshot`, `task_sample`, and `contained_in`.

- [x] Write tests that fail for token reuse/tampering, PID identity mismatch, component-unsafe path containment, and lost `Process` object identity.
- [x] Run the focused tests and confirm failure is caused by missing modules.
- [x] Implement the minimal modules, preserving long-lived `psutil.Process` instances only in memory while JSON stores serializable identity data.
- [x] Run the focused tests and confirm they pass.

### Task 2: Proposals, reasoning, policy, and actions

**Files:** Create `lifeguard/proposals.py`, `lifeguard/reasoning.py`, `lifeguard/policy/broker.py`, `lifeguard/actions.py`, and tests.

**Interfaces:** Produce immutable proposal lookup/hash validation, `analyze`, `Verdict`, `admissible`, `execute_action`, and supported action functions.

- [x] Write failing tests for stale/changed/unknown/recycled/unmanaged/protected/foreground targets, insufficient stop evidence, and proposal hash mismatch.
- [x] Run the broker tests and confirm the intended failures.
- [x] Implement strict Anthropic JSON output, fresh deterministic admission, one-level foreground-family checks, and graceful action execution.
- [x] Run all policy tests and confirm they pass.

### Task 3: Approval callback and notifications

**Files:** Create `lifeguard/notify.py`, `lifeguard/server.py`, and tests.

**Interfaces:** Produce ntfy approve/deny buttons and FastAPI `/decision` and `/status` endpoints.

- [x] Write failing API tests proving missing/reused/mismatched tokens fail, deny executes nothing, and approve invokes the broker before execution.
- [x] Run the server tests and confirm the expected failures.
- [x] Implement callback validation, fresh observation, proposal resolution, confirmation pushes, and localhost-only startup.
- [x] Run the server tests and confirm they pass.

### Task 4: Quarantine and runnable Windows demo

**Files:** Create `lifeguard/quarantine.py`, `lifeguard/tray.py`, `lifeguard/selftest.py`, `lifeguard/worker_demo.py`, `lifeguard/__main__.py`, package initializers, and tests.

**Interfaces:** Produce journaled same-volume quarantine, tray startup, subsystem smoke testing, `run` process registration, and `agent` monitoring loop.

- [x] Write failing tests for quarantine containment/journal completion and CLI parsing.
- [x] Run the tests and confirm the expected failures.
- [x] Implement PREPARED/MOVED/COMMITTED quarantine, cloudflared URL discovery, proposal issuance, and the managed demo worker.
- [x] Run the tests and confirm they pass.

### Task 5: Dependencies, documentation, and verification

**Files:** Create `requirements.txt`; modify `README.md`.

**Interfaces:** Document Python setup, `ANTHROPIC_API_KEY`, cloudflared installation, ntfy subscription, run command, agent command, and expected approval flow.

- [x] Add constrained dependency versions without pywin32.
- [x] Add concise Windows demo instructions without changing existing Electron instructions.
- [x] Run `python -m unittest discover -s tests -v`, Python compilation, and inspect the final diff.
- [ ] Run the existing TypeScript test/typecheck/build suite (blocked before execution by the machine's package-age policy).
- [x] Report external checks that require a real Anthropic key, phone subscription, and cloudflared network access separately from local verification.
