# Non-UI readiness audit

Audited on 2026-09-12. This record covers the autonomous engine, operating-system integration, safety boundaries, reasoning layer, persistence, packaging, and verification. It does not grade the React interface or visual design.

## Verified locally on Windows

| Area | Result | Evidence |
| --- | --- | --- |
| Autonomous background loop | Pass | The hidden packaged app advanced its persistent whole-drive index by 500 files without UI interaction. |
| Fixed-volume discovery and bounded indexing | Pass | Native suite discovered a fixed drive and advanced the persisted queue. |
| Exact duplicate detection | Pass | Size grouping plus SHA-256 found and isolated the synthetic duplicate. |
| Cache/temp classification | Pass | Only a stale file inside a recognized disposable tree was isolated. |
| Action-time race protection | Pass | File type, size, modification time, source hash, and canonical duplicate hash are revalidated immediately before a move. |
| Cross-volume integrity | Pass | Copy fallback hashes source and destination before removing the source and removes a failed partial copy. |
| Recovery | Pass | Quarantined data retained a SHA-256 ledger and was restored successfully. |
| RAM policy | Pass | The isolated worker received a graceful shutdown under forced demo pressure; unknown, foreground, sync, and security processes remain excluded. |
| Reasoning privacy and authority | Pass | Structured output permits only `protect` or `neutral`; raw paths, filenames, content, and app names are omitted; the model has no action tools. |
| OpenAI connection | Pass | A live synthetic request completed using `gpt-5.6-luna` at medium reasoning effort; the request contained no local file path or content. |
| Renderer boundary | Pass | Sandboxed renderer, context isolation, no Node integration, narrow IPC, blocked in-app navigation, and HTTPS-only external opening. |
| Background lifecycle | Pass | One instance only, login startup configured only in packaged builds, hidden login launch, tray persistence, and no sleep/display blocker. |
| Dependencies | Pass | `pnpm audit --audit-level high` reported no known vulnerabilities after moving to Electron 44.3.0. |
| Unit/policy suite | Pass | 10/10 tests passed. |
| Compilation and production bundle | Pass | TypeScript and `electron-vite build` passed. |
| Windows package | Pass | Electron 44.3.0 unpacked app passed every native check. |
| Windows installer | Pass, unsigned | NSIS installer was produced successfully. Signing is an external release credential. |

The repeatable commands are:

```powershell
pnpm audit:backend
pnpm audit --audit-level high
.\scripts\verify-native.ps1
pnpm dist
```

## Set up, awaiting external evidence

- **OpenAI credential persistence:** implementation and live synthetic smoke test are ready. Keep credentials in the ignored local `.env.local`; never bundle or commit them. The teammate can rerun `pnpm reasoning:check` after adding their own key locally.
- **macOS:** the observer, app-process discovery, conservative permission fallback, fixed-volume adapter, packaging, native fixture verifier, and GitHub Actions job are implemented. A passing macOS Actions run and the teammate's physical-Mac run are still required before claiming Mac validation.
- **Distribution trust:** Windows code signing and Apple signing/notarization require team-owned certificates and cannot be completed from this repository alone.

## Deliberate product boundary that still needs a decision

The current autonomous storage action moves eligible files into an app-owned quarantine. A rename on the same volume does **not** increase free disk space. This is intentionally honest and reversible, but it means the MVP demonstrates autonomous classification, isolation, and recovery—not final capacity reclamation.

Before claiming that Lifeguard “frees storage,” choose and implement one of these policies:

1. Purge verified cache/temp items and reverified exact duplicates after a stated retention window.
2. Compress quarantined items and report only measured physical bytes saved.
3. Dehydrate files through a provider adapter only after authoritative remote-sync verification.

This cannot be resolved as a frontend change; it is the remaining core product/safety choice. Until then, interface copy should say **isolated** or **recoverable**, not **freed**, **saved**, or **reclaimed**.

## Post-hackathon hardening

- Replace the JSON-backed scan index with SQLite if long-duration tests show state growth or write latency on multi-million-file machines.
- Run extended sleep/wake, shutdown-during-move, low-disk, permission-change, removable-volume, and multi-user tests.
- Add signed auto-update only after release certificates and an update channel exist.
