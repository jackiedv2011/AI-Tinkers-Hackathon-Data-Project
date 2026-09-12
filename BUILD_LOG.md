# Lifeguard build log

## Build scope

This repository was initialized for the AI Tinkers Hackathon as a net-new Lifeguard MVP. The project is a local Electron desktop application for Windows and macOS; it has no iOS/mobile companion.

## Hackathon-created components

- Electron, TypeScript, React, and Vite application shell
- Shared deterministic resource-policy engine
- Windows PowerShell observer for foreground process, process memory, and free RAM
- macOS observer adapter using `ps`, `vm_stat`, and a fail-closed foreground-app lookup
- Exact SHA-256 duplicate detection, recoverable Quarantine, and Restore flow
- Controlled live-demo memory worker and autonomous scheduler
- Local action log, workspace protection policy, and desktop tray integration

## Safety boundary

No action is decided by an LLM. Lifeguard acts only within an approved folder/process scope, excludes the named project and foreground app, and never permanently deletes files.
