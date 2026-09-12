# Lifeguard

Lifeguard is a desktop-only autonomous resource guardian for Windows and macOS. It protects one named project, watches one approved downloads folder for exact duplicates, and pauses only a pre-approved inactive process when the system is under memory pressure.

## Safety model

- The policy engine is deterministic and local.
- Files are moved to a recoverable Quarantine folder; Lifeguard never permanently deletes files.
- Protected folders, foreground apps, backup clients, security software, and unapproved processes are excluded.
- Every action has a plain-language audit entry and a restore path.

## Run locally

```bash
pnpm install
pnpm dev
```

Choose a protected project folder and an approved folder to inspect. The **Stage live demo** control creates a real exact duplicate and starts an isolated memory worker; the scheduler then handles both without another click.

## Architecture

Electron's main process runs the local policy loop. The Windows observer reads the foreground process, process resource usage, and available RAM through PowerShell; the macOS adapter uses native process and memory commands. The shared policy engine decides whether a pre-approved action is safe. React renders the audit trail, quarantine, and context state.

Lifeguard intentionally has no iOS or mobile companion. The agent needs the desktop-level file and process context that mobile operating systems do not expose.

## Hackathon build log

This repository contains the Lifeguard MVP created for the AI Tinkers Hackathon. The core build is a local Electron + TypeScript application, not an extension of a prior product.
