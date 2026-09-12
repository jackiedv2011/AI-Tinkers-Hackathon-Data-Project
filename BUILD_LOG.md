# Lifeguard build log

## Build scope

This repository was initialized for the AI Tinkers Hackathon as a net-new Lifeguard MVP. The project is a local Electron desktop application for Windows and macOS; it has no iOS/mobile companion.

## Hackathon-created components

- Electron, TypeScript, React, and Vite application shell
- Shared deterministic resource-policy engine
- Windows PowerShell observer for foreground process, process memory, and free RAM
- macOS observer adapter using `ps`, `vm_stat`, and a fail-closed foreground-app lookup
- Windows and macOS fixed-volume discovery with a persistent, time-budgeted whole-drive index
- Deterministic personal-importance scoring and hard path/process exclusions
- Optional GPT-5.6 Luna structured reasoning layer with path redaction and protection-only authority
- Cross-drive exact SHA-256 duplicate detection, known-cache detection, recoverable Quarantine, and Restore flow
- Controlled live-demo memory worker and autonomous scheduler
- Local action log, workspace protection policy, and desktop tray integration
- Automated path-policy tests and a repeatable packaged native suite covering duplicate cleanup, stale-temp cleanup, integrity, quarantine, restoration, and fixture containment
- macOS packaging configuration, native verification script, and physical-device handoff checklist

## Safety boundary

No action is authorized by an LLM. The optional model can only add protection or remain neutral; the local deterministic engine is the sole action authority. Lifeguard inventories fixed drives automatically but mutates only low-importance, high-confidence targets after a learning window. It excludes system/install areas, source trees, protected projects, foreground work, security software, sync clients, and unknown processes. It never permanently deletes files, and it does not claim cloud offload without provider-backed sync verification.
