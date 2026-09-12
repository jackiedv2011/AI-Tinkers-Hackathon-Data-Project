# Lifeguard

Lifeguard is an always-running desktop agent that quietly keeps a Windows or macOS computer healthy. It automatically discovers every fixed drive, incrementally learns the machine's working set, reclaims high-confidence waste through recoverable quarantine, and gracefully closes restartable idle apps only under real memory pressure.

There is no folder-selection workflow and no recommendation inbox. The environment is the product: Lifeguard uses drive layout, file age and location, foreground-app context, memory pressure, protected projects, and recovery history to decide when silence is safer than action.

## What the MVP does

- Discovers all fixed local volumes automatically on Windows and macOS.
- Persists a budgeted depth-first index queue so scanning continues in small background slices across launches.
- Detects exact duplicates with size grouping plus SHA-256 verification across scanned user space.
- Scores importance from recency, personal-folder location, source-code type, protected zones, and known disposable locations.
- Quarantines only low-importance exact duplicates and old files in known cache/temp locations.
- Never permanently deletes user data; every moved file has an integrity hash, explanation, original path, and restore action.
- Watches foreground context and RAM. Under pressure it can gracefully close only a small allowlist of restartable apps after observing them idle for 45 minutes.
- Hard-protects system directories, app installs, active projects, foreground apps, security software, and cloud-sync clients.
- Starts with a 24-hour silent learning window. The isolated demo bypasses that window only inside Lifeguard's own demo directory.
- Runs in the system tray and at login. No iOS or mobile client is claimed.

Cloud-only offload is intentionally not faked: the MVP will not dehydrate a local file until a future provider adapter can prove the remote copy is fully synced.

## Run locally

```bash
pnpm install
pnpm dev
```

Use **Stage safe live demo** to create two synthetic 4 MB installer files, a stale 3 MB temporary file, and an isolated memory worker inside Lifeguard-owned fixture directories. One click stages the conditions; the normal background policy discovers the duplicate and stale temporary file, moves them into recoverable quarantine, and closes the worker without another prompt.

## Build

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm package
```

On Windows, the complete native verification suite can be rerun with:

```powershell
.\scripts\verify-native.ps1
```

It validates unit policy boundaries, compilation, packaging, fixed-drive discovery, duplicate cleanup, stale-temp cleanup, graceful memory reclamation, SHA-256 integrity, quarantine, restoration, and fixture-only mutation before restarting Lifeguard.

The unpacked Windows application is written to `dist/win-unpacked/Lifeguard.exe`. A macOS package must be produced and verified on macOS because Electron Builder does not cross-sign a Mac application from Windows.

## Architecture and safety

Electron's main process owns all operating-system access. `observer.ts` reads memory, foreground process, process inventory, and fixed volumes. `storage-indexer.ts` advances a persistent bounded scan. `path-policy.ts` provides deterministic exclusions and importance scoring. `agent.ts` is the sole action authority and writes the recovery ledger. The React renderer receives a narrow IPC bridge and has no direct filesystem access.

The index intentionally skips reparse points, system/install areas, application data outside recognized disposable caches, `.git`, `node_modules`, protected projects, and Lifeguard's own quarantine. Permission errors fail closed and scanning continues.

## Hackathon eligibility

This repository contains the net-new Lifeguard MVP created during the AI Tinkers Hackathon. Libraries and build tooling are reusable components; the storage indexer, policy engine, observers, quarantine ledger, demo harness, and interface are hackathon work.
